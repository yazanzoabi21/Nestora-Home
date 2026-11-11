export type BffAudience = 'admin' | 'customer';
let csrfRequest: Promise<string> | null = null;
let csrfRetryAt = 0;

export class BffRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super('The request could not be completed.'); }
}

async function csrf(): Promise<string> {
  if (csrfRetryAt && Date.now() >= csrfRetryAt) { csrfRequest = null; csrfRetryAt = 0; }
  csrfRequest ??= fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.timeout(10_000), headers: { 'ngsw-bypass': 'true' } })
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { code?: string };
        throw new BffRequestError(response.status, error.code === 'ORIGIN_DENIED' ? 'ORIGIN_DENIED' : 'CSRF_UNAVAILABLE');
      }
      const data = await response.json() as { csrfToken: string };
      if (!/^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)) throw new BffRequestError(503, 'CSRF_UNAVAILABLE');
      return data.csrfToken;
    }).catch((error: unknown) => {
      // Share failures briefly as well as in-flight requests during an outage.
      csrfRetryAt = Date.now() + 1000;
      throw error;
    });
  return csrfRequest;
}

export class BffApi {
  onUnauthorized: (() => void) | null = null;
  sessionVersion = 0;
  constructor(readonly audience: BffAudience) {}

  async fetch(path: string, init: RequestInit = {}, anonymous = false, retryCsrf = true): Promise<Response> {
    const version = this.sessionVersion;
    if (!path.startsWith(`/api/${this.audience}/`)) throw new Error('Invalid BFF route.');
    const headers = new Headers(init.headers);
    headers.delete('authorization');
    headers.delete('apikey');
    headers.set('ngsw-bypass', 'true');
    const method = (init.method ?? 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) headers.set('x-csrf-token', await csrf());
    if (version !== this.sessionVersion) throw new BffRequestError(409, 'REQUEST_CANCELLED');
    const response = await fetch(path, { ...init, method, headers,
      credentials: anonymous ? 'omit' : 'same-origin', cache: 'no-store', redirect: 'error' });
    if (response.status === 401 || response.status === 403) {
      const error = await response.clone().json().catch(() => ({})) as { code?: string };
      if (error.code === 'CSRF_FAILED') {
        csrfRequest = null; csrfRetryAt = 0;
        // The backend rejected the request before executing its handler.
        if (retryCsrf && version === this.sessionVersion) return this.fetch(path, init, anonymous, false);
      }
      const establishingSession = /\/auth\/(?:login|register|oauth)$/.test(path);
      if (!establishingSession && version === this.sessionVersion &&
        ((response.status === 401 && ['SESSION_REQUIRED', 'SESSION_EXPIRED', 'SESSION_INVALID', 'REFRESH_FAILED'].includes(error.code ?? '')) ||
          (response.status === 403 && error.code === 'ACCOUNT_NOT_AUTHORIZED'))) this.onUnauthorized?.();
    }
    return response;
  }

  async json<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.fetch(`/api/${this.audience}/${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { code?: string };
      throw new BffRequestError(response.status, error.code ?? 'REQUEST_FAILED');
    }
    return response.json() as Promise<T>;
  }
}
