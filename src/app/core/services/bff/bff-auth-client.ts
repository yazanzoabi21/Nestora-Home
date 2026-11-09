import type { AuthChangeEvent } from '@supabase/supabase-js';
import type { AuthenticatedUserProfile } from '../../models/auth';
import type { BrowserAuthClient, BrowserAuthResponse, BrowserSession, BrowserUser } from '../../models/auth/browser-auth.models';
import { BffApi, BffRequestError } from './bff-api';

interface SessionView {
  user: BrowserUser | null;
  session: BrowserSession | null;
  recovery?: boolean;
  confirmationRequired?: boolean;
  profile?: AuthenticatedUserProfile | null;
}

type SessionResult = Awaited<ReturnType<BrowserAuthClient['getSession']>>;

export class BffAuthClient implements BrowserAuthClient {
  readonly serverManaged = true;
  private readonly listeners = new Set<(event: AuthChangeEvent, session: BrowserSession | null) => void>();
  private current: BrowserSession | null = null;
  private recovery = false;
  private initialized = false;
  private pendingLogout = false;
  private readonly events: BroadcastChannel | null;
  private profile: AuthenticatedUserProfile | null | undefined;
  private profileVersion = 0;
  private sessionRequest: { version: number; profileVersion: number; promise: Promise<SessionResult> } | null = null;
  private logoutRequest: Promise<{ error: Error | null; localSessionCleared: boolean }> | null = null;

  get customerProfile(): AuthenticatedUserProfile | null | undefined { return this.profile; }

  invalidateCustomerProfile(): void {
    if (this.api.audience !== 'customer') return;
    this.profile = undefined;
    // A session read started before an edit/refresh must not restore its old profile.
    this.profileVersion++;
  }

  constructor(private readonly api: BffApi, private readonly remember: () => boolean) {
    api.onUnauthorized = () => this.invalidate();
    this.events = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`nestora-bff-${api.audience}`);
    this.events?.addEventListener('message', () => { this.api.sessionVersion++; void this.getSession(); });
  }

  private publish(view: SessionView, event: AuthChangeEvent): void {
    this.initialized = true;
    this.current = view.session;
    this.profile = this.api.audience === 'customer' && view.session
      ? view.profile === undefined ? undefined : view.profile?.id === view.session.user.id ? view.profile : null
      : undefined;
    const recoveryStarted = !!view.recovery && !this.recovery;
    this.recovery = !!view.recovery;
    for (const listener of this.listeners) listener(recoveryStarted ? 'PASSWORD_RECOVERY' : event, this.current);
  }
  private empty(): SessionView { return { user: null, session: null }; }
  private failure(error: unknown): Error { return error instanceof Error ? error : new Error('Authentication failed.'); }

  getSession(): Promise<SessionResult> {
    const version = this.api.sessionVersion;
    const profileVersion = this.profileVersion;
    if (this.sessionRequest?.version === version && this.sessionRequest.profileVersion === profileVersion) return this.sessionRequest.promise;
    const promise = Promise.resolve().then(() => this.readSession(version, profileVersion)).finally(() => {
      if (this.sessionRequest?.promise === promise) this.sessionRequest = null;
    });
    this.sessionRequest = { version, profileVersion, promise };
    return promise;
  }

  private async readSession(version: number, profileVersion: number): Promise<SessionResult> {
    try {
      if (version !== this.api.sessionVersion || profileVersion !== this.profileVersion) return { data: { session: this.current }, error: null };
      if (this.logoutPending()) {
        const result = await this.signOut();
        return { data: { session: null }, error: result.error };
      }
      const view = await this.api.json<SessionView>('auth/session');
      if (version !== this.api.sessionVersion || profileVersion !== this.profileVersion) return { data: { session: this.current }, error: null };
      if (!this.initialized || this.current?.user.id !== view.session?.user.id || this.recovery !== !!view.recovery) {
        this.publish(view, view.session ? this.initialized ? 'SIGNED_IN' : 'INITIAL_SESSION' : 'SIGNED_OUT');
      } else if (this.api.audience === 'customer' && JSON.stringify(this.profile) !== JSON.stringify(view.profile)) {
        this.publish(view, 'USER_UPDATED');
      }
      return { data: { session: view.session, profile: view.profile }, error: null };
    } catch (error: unknown) {
      if (version !== this.api.sessionVersion || profileVersion !== this.profileVersion) return { data: { session: this.current }, error: null };
      this.publish(this.empty(), 'SIGNED_OUT');
      if (error instanceof BffRequestError && [401, 403].includes(error.status)) return { data: { session: null }, error: null };
      return { data: { session: null }, error: this.failure(error) };
    }
  }
  async getUser() {
    const result = await this.getSession();
    return { data: { user: result.data.session?.user ?? null }, error: result.error };
  }
  async signInWithPassword(request: { email: string; password: string }): Promise<BrowserAuthResponse> {
    try {
      if (this.logoutPending()) {
        await this.signOut();
        if (this.logoutPending()) throw new Error('Sign-out has not completed.');
      }
      const version = ++this.api.sessionVersion;
      const view = await this.api.json<SessionView>('auth/login', { ...request, remember: this.remember() });
      if (version !== this.api.sessionVersion) throw new Error('Authentication was cancelled.');
      this.publish(view, 'SIGNED_IN'); this.events?.postMessage('changed');
      return { data: view, error: null };
    } catch (error: unknown) { return { data: this.empty(), error: this.failure(error) }; }
  }
  async signUp(request: Parameters<BrowserAuthClient['signUp']>[0]): Promise<BrowserAuthResponse> {
    try {
      const version = ++this.api.sessionVersion;
      if (!('email' in request)) throw new Error('Email registration is required.');
      const metadata = request.options?.data as Record<string, unknown> | undefined;
      const view = await this.api.json<SessionView>('auth/register', {
        email: request.email, password: request.password, fullName: metadata?.['full_name'], phone: metadata?.['phone'],
      });
      if (version !== this.api.sessionVersion) throw new Error('Authentication was cancelled.');
      if (view.session) { this.publish(view, 'SIGNED_IN'); this.events?.postMessage('changed'); }
      return { data: view, error: null };
    } catch (error: unknown) { return { data: this.empty(), error: this.failure(error) }; }
  }
  async signInWithOAuth(request: Parameters<BrowserAuthClient['signInWithOAuth']>[0]) {
    try {
      const version = ++this.api.sessionVersion;
      if (request.provider !== 'google' || this.api.audience !== 'customer') throw new Error('Provider unavailable.');
      const { url } = await this.api.json<{ url: string }>('auth/oauth', { remember: this.remember() });
      if (version !== this.api.sessionVersion) throw new Error('Authentication was cancelled.');
      window.location.assign(url);
      return { data: { provider: request.provider, url }, error: null };
    } catch {
      // Match the SDK response shape without ever returning provider credentials.
      return { data: { provider: request.provider, url: null }, error: new BffRequestError(503, 'OAUTH_UNAVAILABLE') };
    }
  }
  async resetPasswordForEmail(email: string) {
    try { await this.api.json('auth/recovery', { email }); return { data: {}, error: null }; }
    catch { return { data: null, error: new BffRequestError(503, 'RECOVERY_UNAVAILABLE') }; }
  }
  async updateUser(request: Parameters<BrowserAuthClient['updateUser']>[0]) {
    try {
      if (Object.keys(request).some((key) => key !== 'password') || !request.password) throw new Error('Unsupported account update.');
      const data = await this.api.json<{ user: BrowserUser }>('auth/password', { password: request.password });
      return { data, error: null };
    } catch (error: unknown) { return { data: { user: null }, error: this.failure(error) }; }
  }
  signOut(): Promise<{ error: Error | null; localSessionCleared: boolean }> {
    if (this.logoutRequest) return this.logoutRequest;
    const promise = this.performSignOut().finally(() => {
      if (this.logoutRequest === promise) this.logoutRequest = null;
    });
    this.logoutRequest = promise;
    return promise;
  }

  private async performSignOut(): Promise<{ error: Error | null; localSessionCleared: boolean }> {
    this.api.sessionVersion++;
    this.setLogoutPending(true);
    this.publish(this.empty(), 'SIGNED_OUT');
    try {
      const result = await this.api.json<{ remoteRevocationConfirmed: boolean; localSessionCleared: boolean }>('auth/logout', {});
      this.setLogoutPending(!result.localSessionCleared);
      this.events?.postMessage('changed');
      return { localSessionCleared: result.localSessionCleared,
        error: result.localSessionCleared && result.remoteRevocationConfirmed ? null : new Error('Sign-out could not be fully confirmed.') };
    } catch (error: unknown) { return { error: this.failure(error), localSessionCleared: false }; }
  }
  async startAutoRefresh(): Promise<void> { /* Refresh belongs to the BFF, under the Redis lease. */ }
  async stopAutoRefresh(): Promise<void> { /* No browser token timer exists. */ }
  invalidate(): void { this.api.sessionVersion++; this.publish(this.empty(), 'SIGNED_OUT'); }
  async changePassword(currentPassword: string, newPassword: string): Promise<{ error: Error | null }> {
    try {
      await this.api.json('auth/password/change', { currentPassword, newPassword });
      return { error: null };
    } catch (error: unknown) { return { error: this.failure(error) }; }
  }
  onAuthStateChange(callback: (event: AuthChangeEvent, session: BrowserSession | null) => void) {
    this.listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => { this.listeners.delete(callback); } } } };
  }
  logoutPending(): boolean {
    if (this.pendingLogout) return true;
    try { return localStorage.getItem(`nestora-${this.api.audience}-bff-logout-pending`) === 'true'; }
    catch { return false; }
  }
  private setLogoutPending(pending: boolean): void {
    this.pendingLogout = pending;
    try {
      const key = `nestora-${this.api.audience}-bff-logout-pending`;
      if (pending) localStorage.setItem(key, 'true'); else localStorage.removeItem(key);
    } catch { /* This marker contains no authentication data. */ }
  }
}
