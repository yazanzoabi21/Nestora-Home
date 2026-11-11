import type { NestoraSupabaseClient } from '../../models/auth/browser-auth.models';
import { AuthPersistenceStorage } from '../../tokens/supabase.tokens';
import { isTransientAuthError } from './auth-request-error';

export interface LogoutResult {
  readonly localSessionCleared: boolean;
  readonly remoteRevocationConfirmed: boolean;
}

/** One queue per audience; no cross-audience logout or global storage clearing. */
export class AuthSessionLifecycle {
  private pending: Promise<void> = Promise.resolve();
  private epoch = 0;
  private blocked = false;
  private logoutRequest: Promise<LogoutResult> | null = null;

  constructor(
    private readonly client: Pick<NestoraSupabaseClient, 'auth'>,
    private readonly persistence: AuthPersistenceStorage,
  ) {}

  get version(): number { return this.epoch; }
  get acceptsSession(): boolean { return !this.blocked; }
  isCurrent(version: number): boolean { return !this.blocked && version === this.epoch; }

  invalidate(): void {
    this.epoch += 1;
    this.blocked = true;
  }

  prepareSession(remember?: boolean): void {
    this.blocked = false;
    if (remember === undefined) this.persistence.resumeSessionWrites();
    else this.persistence.setRememberSession(remember);
  }

  authenticate<T>(
    remember: boolean | undefined,
    authorize: (assertCurrent: () => void) => Promise<T>,
    clearState: () => void,
  ): Promise<T> {
    const version = ++this.epoch;
    return this.enqueue(async () => {
      const assertCurrent = (): void => {
        if (version !== this.epoch) throw new Error('Authentication was cancelled.');
      };
      assertCurrent();
      const previousRemember = this.persistence.remembersSession;
      this.prepareSession(remember);
      try {
        const result = await authorize(assertCurrent);
        assertCurrent();
        await this.client.auth.startAutoRefresh();
        assertCurrent();
        return result;
      } catch (error: unknown) {
        // The BFF validates roles before issuing a cookie and cleans up failed
        // establishment itself. A rejected login must not initiate a logout.
        if (this.client.auth.serverManaged) {
          if (version === this.epoch) this.persistence.setRememberSession(previousRemember);
        } else if (isTransientAuthError(error) && version === this.epoch) this.persistence.setRememberSession(previousRemember);
        else await this.clear(clearState);
        throw error;
      }
    });
  }

  logout(clearState: () => void): Promise<LogoutResult> {
    if (this.logoutRequest) return this.logoutRequest;
    this.epoch += 1;
    this.blocked = true;
    clearState();
    const request = this.enqueue(() => this.clear(clearState)).finally(() => {
      if (this.logoutRequest === request) this.logoutRequest = null;
    });
    this.logoutRequest = request;
    return request;
  }

  private async clear(clearState: () => void): Promise<LogoutResult> {
    this.blocked = true;
    clearState();
    let remoteRevocationConfirmed = false;
    let localSessionCleared = false;
    try {
      await this.client.auth.stopAutoRefresh();
      const result = await this.client.auth.signOut({ scope: 'local' });
      remoteRevocationConfirmed = !result.error;
      if (this.client.auth.serverManaged) localSessionCleared = result.localSessionCleared === true;
    } catch {
      // A network failure must not retain an authenticated local session.
    } finally {
      this.persistence.clearAuthSession();
    }
    // Remote errors can bypass SDK removal. With storage empty, public signOut
    // completes local removal without a remote token. Do not use private SDK APIs.
    try {
      if (!this.client.auth.serverManaged) {
        await this.client.auth.signOut({ scope: 'local' });
        const { data, error } = await this.client.auth.getSession();
        localSessionCleared = !error && data.session === null;
      }
    } catch {
      // Report local uncertainty separately from remote revocation.
    } finally {
      this.persistence.clearAuthSession();
      clearState();
    }
    return { localSessionCleared, remoteRevocationConfirmed };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
}
