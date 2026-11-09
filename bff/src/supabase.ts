import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { BffConfig } from './config.js';
import { HttpError, assertTokenFree } from './security.js';

export type Audience = 'admin' | 'customer';
export interface RevocationResult {
  status: 'confirmed' | 'already_invalid' | 'uncertain';
  retryable: boolean;
  retryAfterSeconds?: number;
}
export interface BrowserUser {
  id: string;
  email?: string;
  user_metadata: Record<string, string>;
  app_metadata: { provider?: string };
}
export interface Profile {
  id: string;
  role_id: string | null;
  is_active: boolean | null;
  roles: { id: string; name: string; description?: string | null } | null;
  [column: string]: unknown;
}
export const PROFILE_SELECT = 'id,role_id,full_name,email,phone,avatar_media_id,avatar_url,is_active,created_at,birthday,roles(id,name,description)';

export function browserUser(user: User): BrowserUser {
  const user_metadata: Record<string, string> = {};
  for (const key of ['full_name', 'avatar_url', 'phone']) {
    const value: unknown = user.user_metadata[key];
    if (typeof value === 'string') user_metadata[key] = value.slice(0, 2048);
  }
  const provider: unknown = user.app_metadata['provider'];
  const result = { id: user.id, email: user.email, user_metadata,
    app_metadata: typeof provider === 'string' ? { provider } : {} };
  assertTokenFree(result);
  return result;
}

export class SupabaseGateway {
  readonly fetch: typeof globalThis.fetch;
  constructor(readonly config: BffConfig, fetcher: typeof globalThis.fetch = globalThis.fetch) {
    this.fetch = (input, init) => fetcher(input, { ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      redirect: 'error',
    });
  }

  authClient(storage?: Map<string, string>): SupabaseClient {
    return createClient(this.config.supabaseUrl, this.config.supabaseKey, {
      global: { fetch: this.fetch },
      // The SDK ignores custom PKCE storage when persistSession is false. This
      // request-local server map is encrypted into Redis before redirecting.
      auth: { flowType: 'pkce', persistSession: !!storage, autoRefreshToken: false, detectSessionInUrl: false,
        ...(storage ? { storage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => { storage.set(key, value); },
          removeItem: (key: string) => { storage.delete(key); },
        } } : {}),
      },
    });
  }

  userClient(jwt: string | (() => Promise<string>)): SupabaseClient {
    return createClient(this.config.supabaseUrl, this.config.supabaseKey, {
      accessToken: typeof jwt === 'function' ? jwt : async () => jwt, global: { fetch: this.fetch },
    });
  }

  async identity(jwt: string): Promise<BrowserUser> {
    const { data, error } = await this.authClient().auth.getUser(jwt);
    if (error || !data.user) throw new HttpError(error?.status && error.status >= 500 ? 503 : 401, 'SESSION_INVALID');
    return browserUser(data.user);
  }

  async profile(jwt: string, userId: string, audience: Audience): Promise<Profile> {
    const { data, error } = await this.userClient(jwt).from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
    if (error) throw new HttpError(503, 'PROFILE_UNAVAILABLE');
    const profile = data as unknown as Profile | null;
    const allowed = audience === 'admin' ? ['admin', 'super_admin'] : ['customer'];
    if (!profile || profile.is_active !== true || !profile.roles || !allowed.includes(profile.roles.name)) {
      throw new HttpError(403, 'ACCOUNT_NOT_AUTHORIZED');
    }
    assertTokenFree(profile);
    return profile;
  }

  async revoke(accessToken: string): Promise<RevocationResult> {
    try {
      const response = await this.fetch(`${this.config.supabaseUrl}/auth/v1/logout?scope=local`, {
        method: 'POST', headers: { apikey: this.config.supabaseKey, Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return { status: 'confirmed', retryable: false };
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        const header = response.headers.get('retry-after');
        const seconds = header === null ? NaN : /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
        return { status: 'uncertain', retryable: true,
          ...(Number.isFinite(seconds) ? { retryAfterSeconds: Math.max(0, Math.ceil(seconds)) } : {}) };
      }
      // Error messages are neither logged nor relayed. Only documented structured
      // credential errors distinguish invalid credentials from an uncertain failure.
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
      const invalid = [400, 401, 403, 404].includes(response.status) &&
        ['bad_jwt', 'jwt_expired', 'session_not_found', 'user_not_found'].includes(String(code));
      return { status: invalid ? 'already_invalid' : 'uncertain', retryable: false };
    } catch { return { status: 'uncertain', retryable: true }; }
  }

  async refresh(refreshToken: string): Promise<Session> {
    const { data, error } = await this.authClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new HttpError(error?.status && error.status >= 400 && error.status < 500 ? 401 : 503, 'REFRESH_FAILED');
    return data.session;
  }
}
