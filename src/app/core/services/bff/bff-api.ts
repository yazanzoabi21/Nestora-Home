export type BffAudience = 'admin' | 'customer';
let csrfRequest: Promise<string> | null = null;

export class BffRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super('The request could not be completed.'); }
}

async function csrf(): Promise<string> {
  csrfRequest ??= fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store', headers: { 'ngsw-bypass': 'true' } })
    .then(async (response) => {
      if (!response.ok) throw new BffRequestError(response.status, 'CSRF_UNAVAILABLE');
      const data = await response.json() as { csrfToken: string };
      return data.csrfToken;
    }).catch((error: unknown) => { csrfRequest = null; throw error; });
  return csrfRequest;
}

export class BffApi {
  onUnauthorized: (() => void) | null = null;
  sessionVersion = 0;
  constructor(readonly audience: BffAudience) {}

  async fetch(path: string, init: RequestInit = {}, anonymous = false): Promise<Response> {
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
    if (response.status === 401 && !path.endsWith('/auth/login') && version === this.sessionVersion) this.onUnauthorized?.();
    if (response.status === 403) {
      const error = await response.clone().json().catch(() => ({})) as { code?: string };
      if (error.code === 'CSRF_FAILED') csrfRequest = null;
      if (error.code === 'ACCOUNT_NOT_AUTHORIZED' && version === this.sessionVersion) this.onUnauthorized?.();
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
