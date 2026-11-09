import type { Session } from '@supabase/supabase-js';
import type { BffConfig } from './config.js';
import type { Lease, SharedStore } from './store.js';
import { HttpError, Vault, fingerprint, opaqueId, validId } from './security.js';
import { SupabaseGateway, type Audience, type BrowserUser, type Profile } from './supabase.js';
import { Revocations, type RevocationOutcome } from './revocations.js';

const ADMIN_SESSION_SECONDS = 8 * 3600;
const ADMIN_IDLE_SECONDS = 30 * 60;

export interface ServerSession {
  audience: Audience;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  absoluteExpiresAt: number;
  createdAt?: number; // Older records lack this timestamp; Admin sessions must reauthenticate.
  lastSeenAt: number;
  remember: boolean;
  recovery: boolean;
  user: BrowserUser;
}
export interface ResolvedSession { session: ServerSession; profile: Profile | null }
export interface SessionTiming { queueMs?: number; validationMs?: number }
export const cookieName = (audience: Audience): string => `__Host-nestora-${audience}`;

export class Sessions {
  readonly vault: Vault;
  readonly revocations: Revocations;
  constructor(readonly store: SharedStore, readonly gateway: SupabaseGateway, readonly config: BffConfig) {
    this.vault = new Vault(config.encryptionKey);
    this.revocations = new Revocations(store, gateway, this.vault);
  }
  key(audience: Audience, id: string): string { return `nestora:session:${audience}:{${fingerprint(id)}}`; }

  async create(audience: Audience, tokens: Session, remember: boolean, recovery = false): Promise<{ id: string; result: ResolvedSession }> {
    const user = await this.gateway.identity(tokens.access_token);
    const profile = recovery ? null : await this.gateway.profile(tokens.access_token, user.id, audience);
    const now = Date.now();
    if (audience === 'admin') remember = false;
    const session: ServerSession = { audience, accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      tokenExpiresAt: (tokens.expires_at ?? Math.floor(now / 1000) + tokens.expires_in) * 1000,
      absoluteExpiresAt: now + 1000 * (recovery ? 600 : audience === 'admin' ? ADMIN_SESSION_SECONDS : remember ? this.config.rememberedSeconds : this.config.sessionSeconds),
      createdAt: now,
      lastSeenAt: now, remember, recovery, user };
    const id = opaqueId();
    const key = this.key(audience, id);
    await this.store.set(key, this.vault.seal(session, key), this.ttl(session));
    return { id, result: { session, profile } };
  }

  async resolve(audience: Audience, id: string | undefined, allowRecovery = false, touch = true,
    timing?: SessionTiming, signal?: AbortSignal): Promise<ResolvedSession> {
    if (!validId(id)) throw new HttpError(401, 'SESSION_REQUIRED');
    const key = this.key(audience, id);
    if (audience === 'admin') {
      try {
        return await this.resolveAdmin(key, allowRecovery, touch, timing, signal);
      } catch (error: unknown) {
        if (!(error instanceof HttpError) || error.code !== 'SESSION_CHANGED') throw error;
        return this.resolveAdmin(key, allowRecovery, touch, timing, signal);
      }
    }

    const queuedAt = performance.now();
    return this.store.lock(key, async (lease) => {
      if (timing) timing.queueMs = performance.now() - queuedAt;
      const validationStarted = performance.now();
      const session = await this.prepareSession(key, audience, lease);
      if (session.recovery && !allowRecovery) throw new HttpError(403, 'RECOVERY_SESSION_ONLY');
      let profile: Profile | null;
      try {
        session.user = await this.gateway.identity(session.accessToken);
        profile = session.recovery ? null : await this.gateway.profile(session.accessToken, session.user.id, audience);
      } catch (error: unknown) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) await this.store.delete(key, lease);
        throw error;
      }
      if (timing) timing.validationMs = performance.now() - validationStarted;
      if (touch) session.lastSeenAt = Date.now();
      await this.store.set(key, this.vault.seal(session, key), this.ttl(session), lease);
      return { session, profile };
    }, signal);
  }

  private async resolveAdmin(key: string, allowRecovery: boolean, touch: boolean,
    timing?: SessionTiming, signal?: AbortSignal): Promise<ResolvedSession> {
    // Only refresh and commit need a lease. Every request still performs
    // live identity and role checks before it can use the session.
    const lock = <T>(work: (lease: Lease) => Promise<T>): Promise<T> => {
      const queuedAt = performance.now();
      return this.store.lock(key, (lease) => {
        if (timing) timing.queueMs = (timing.queueMs ?? 0) + performance.now() - queuedAt;
        return work(lease);
      }, signal);
    };

    signal?.throwIfAborted();
    let session = await this.readSession(key, 'admin');
    if (session.tokenExpiresAt < Date.now() + 60_000) {
      session = await lock((lease) => this.prepareSession(key, 'admin', lease, timing));
    }
    if (session.recovery && !allowRecovery) throw new HttpError(403, 'RECOVERY_SESSION_ONLY');
    const started = performance.now();
    const [identity, authorization] = await Promise.allSettled([
      this.gateway.identity(session.accessToken),
      session.recovery ? Promise.resolve(null) : this.gateway.profile(session.accessToken, session.user.id, 'admin'),
    ]);
    if (timing) timing.validationMs = (timing.validationMs ?? 0) + performance.now() - started;

    return lock(async (lease) => {
      const current = await this.readSession(key, 'admin', lease);
      if (current.accessToken !== session.accessToken || current.refreshToken !== session.refreshToken) {
        // A concurrent refresh rotated credentials. Never accept validation of
        // the old token or delete the newly rotated record.
        throw new HttpError(503, 'SESSION_CHANGED');
      }
      try {
        if (identity.status === 'rejected') throw identity.reason;
        if (identity.value.id !== current.user.id) throw new HttpError(401, 'SESSION_INVALID');
        if (authorization.status === 'rejected') throw authorization.reason;
      } catch (error: unknown) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) await this.store.delete(key, lease);
        throw error;
      }
      current.user = identity.value;
      if (touch) current.lastSeenAt = Date.now();
      await this.store.set(key, this.vault.seal(current, key), this.ttl(current), lease);
      return { session: current, profile: authorization.value };
    });
  }

  private async readSession(key: string, audience: Audience, lease?: Lease): Promise<ServerSession> {
    const raw = await this.store.get(key);
    if (!raw) throw new HttpError(401, 'SESSION_EXPIRED');
    const session = this.vault.open<ServerSession>(raw, key);
    if (session.audience !== audience || this.ttl(session) <= 0) {
      // Re-read under the lease before deleting an expired snapshot. A
      // concurrent request may already have renewed its idle deadline.
      if (!lease) return this.store.lock(key, (currentLease) => this.readSession(key, audience, currentLease));
      await this.store.delete(key, lease);
      throw new HttpError(401, 'SESSION_EXPIRED');
    }
    return session;
  }

  private async prepareSession(key: string, audience: Audience, lease: Lease, timing?: SessionTiming): Promise<ServerSession> {
    const session = await this.readSession(key, audience, lease);
    if (session.tokenExpiresAt >= Date.now() + 60_000) return session;
    const started = performance.now();
    try {
      const tokens = await this.gateway.refresh(session.refreshToken);
      session.accessToken = tokens.access_token;
      session.refreshToken = tokens.refresh_token;
      session.tokenExpiresAt = (tokens.expires_at ?? Math.floor(Date.now() / 1000) + tokens.expires_in) * 1000;
      await this.store.set(key, this.vault.seal(session, key), this.ttl(session), lease);
      return session;
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status === 401) await this.store.delete(key, lease);
      throw error;
    } finally {
      if (timing) timing.validationMs = (timing.validationMs ?? 0) + performance.now() - started;
    }
  }

  async logout(audience: Audience, id: string | undefined): Promise<RevocationOutcome> {
    if (!validId(id)) return { status: 'not_required', retryScheduled: false };
    const key = this.key(audience, id);
    const revocationKey = this.revocations.key(audience, id);
    const expiredCredential = await this.store.lock(key, async (lease) => {
      const raw = await this.store.get(key);
      const session = raw ? this.vault.open<ServerSession>(raw, key) : null;
      const pending = session ? this.revocations.prepare(revocationKey, session.accessToken, session.tokenExpiresAt) : null;
      // One atomic Redis operation: durable retry credentials and local invalidation.
      // No upstream network request is made while holding the session lock.
      await this.store.delete(key, lease, pending ?? undefined);
      return !!session && !pending;
    });
    if (expiredCredential) return { status: 'already_invalid', retryScheduled: false };
    const result = await this.revocations.process(revocationKey);
    // A missing receipt does not prove that Supabase revoked an old/expired session.
    return result.status === 'not_required' ? { status: 'uncertain', retryScheduled: false } : result;
  }

  revoke(audience: Audience, tokens: Session): Promise<RevocationOutcome> {
    const expiresAt = (tokens.expires_at ?? Math.floor(Date.now() / 1000) + tokens.expires_in) * 1000;
    return this.revocations.request(audience, tokens.access_token, expiresAt);
  }

  private ttl(session: ServerSession): number {
    if (session.audience === 'admin') {
      // Enforce the current policy even for records issued under an older policy.
      if (session.createdAt === undefined || !Number.isFinite(session.createdAt)) return 0;
      const expiresAt = Math.min(session.absoluteExpiresAt, session.createdAt + ADMIN_SESSION_SECONDS * 1000,
        session.lastSeenAt + ADMIN_IDLE_SECONDS * 1000);
      return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    }
    const idle = session.remember ? 7 * 86400 : this.config.idleSeconds;
    return Math.max(0, Math.ceil((Math.min(session.absoluteExpiresAt, session.lastSeenAt + idle * 1000) - Date.now()) / 1000));
  }
}
