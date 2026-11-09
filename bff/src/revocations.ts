import type { Lease, PendingWrite, SharedStore } from './store.js';
import { fingerprint, Vault } from './security.js';
import type { Audience, SupabaseGateway } from './supabase.js';

export interface RevocationOutcome {
  status: 'confirmed' | 'already_invalid' | 'uncertain' | 'not_required';
  retryScheduled: boolean;
}
interface PendingRevocation {
  state: 'pending'; accessToken: string; expiresAt: number; attempts: number; nextAttemptAt: number;
}
interface Receipt { state: 'confirmed' | 'already_invalid' | 'uncertain'; expiresAt: number }
type RecordValue = PendingRevocation | Receipt;
const MAX_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

/** A bounded encrypted outbox. It never reads or writes authentication sessions. */
export class Revocations {
  private cursor = '0';
  private running: Promise<void> | null = null;
  constructor(private readonly store: SharedStore, private readonly gateway: SupabaseGateway, private readonly vault: Vault) {}

  key(audience: Audience, id: string): string { return `nestora:revocation:${audience}:{${fingerprint(id)}}`; }
  prepare(key: string, accessToken: string, tokenExpiresAt: number): PendingWrite | null {
    const now = Date.now();
    const expiresAt = Math.min(now + MAX_SECONDS * 1000, tokenExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    const record: PendingRevocation = { state: 'pending', accessToken, expiresAt, attempts: 0, nextAttemptAt: now };
    return { key, value: this.vault.seal(record, key), seconds: Math.ceil((expiresAt - now) / 1000) };
  }

  async request(audience: Audience, accessToken: string, tokenExpiresAt: number): Promise<RevocationOutcome> {
    const key = this.key(audience, accessToken);
    const pending = this.prepare(key, accessToken, tokenExpiresAt);
    if (!pending) return { status: 'already_invalid', retryScheduled: false };
    try {
      const lease = await this.store.tryLease(key);
      if (lease) {
        try {
          if (!await this.store.get(key)) await this.store.set(key, pending.value, pending.seconds, lease);
        } finally { await this.store.releaseLease(lease); }
      }
      return await this.process(key);
    } catch { return { status: 'uncertain', retryScheduled: false }; }
  }

  async process(key: string): Promise<RevocationOutcome> {
    try {
      // Non-blocking, separate from session locks: retries never produce SESSION_BUSY.
      const lease = await this.store.tryLease(key);
      if (!lease) return { status: 'uncertain', retryScheduled: true };
      try {
        const raw = await this.store.get(key);
        if (!raw) return { status: 'not_required', retryScheduled: false };
        const record = this.vault.open<RecordValue>(raw, key);
        if (record.state !== 'pending') return { status: record.state, retryScheduled: false };
        if (record.expiresAt <= Date.now()) {
          await this.store.delete(key, lease);
          return { status: 'uncertain', retryScheduled: false };
        }
        if (record.attempts >= MAX_ATTEMPTS) return await this.finish(key, record.expiresAt, 'uncertain', lease);
        if (record.nextAttemptAt > Date.now()) return { status: 'uncertain', retryScheduled: true };
        // Persist the attempt before HTTP so a worker crash cannot reset the bound.
        record.attempts++;
        record.nextAttemptAt = Date.now() + 30_000;
        await this.save(key, record, lease);
        const result = await this.gateway.revoke(record.accessToken);
        if (result.retryable && record.attempts < MAX_ATTEMPTS) {
          const delay = Math.max(5 * 3 ** (record.attempts - 1) + Math.random(), result.retryAfterSeconds ?? 0);
          record.nextAttemptAt = Date.now() + delay * 1000;
          if (record.nextAttemptAt < record.expiresAt) {
            await this.save(key, record, lease);
            return { status: 'uncertain', retryScheduled: true };
          }
        }
        return await this.finish(key, record.expiresAt, result.status, lease);
      } finally { await this.store.releaseLease(lease).catch(() => undefined); }
    } catch {
      // Redis failures never restore a session or leak an upstream error/credential.
      return { status: 'uncertain', retryScheduled: false };
    }
  }

  private async save(key: string, record: RecordValue, lease: Lease): Promise<void> {
    const seconds = Math.ceil((record.expiresAt - Date.now()) / 1000);
    if (seconds <= 0) { await this.store.delete(key, lease); return; }
    await this.store.set(key, this.vault.seal(record, key), seconds, lease);
  }
  private async finish(key: string, expiresAt: number, state: Receipt['state'], lease: Lease): Promise<RevocationOutcome> {
    // Receipts support repeated requests without retaining terminal credentials.
    await this.save(key, { state, expiresAt }, lease);
    return { status: state, retryScheduled: false };
  }

  drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      const page = await this.store.scanRevocations(this.cursor);
      this.cursor = page.cursor;
      const keys = page.keys.filter((key) => !key.endsWith(':lock')).slice(0, 100);
      for (let offset = 0; offset < keys.length; offset += 4) {
        await Promise.all(keys.slice(offset, offset + 4).map((key) => this.process(key)));
      }
    })().catch(() => undefined).finally(() => { this.running = null; });
    return this.running;
  }

  start(): () => Promise<void> {
    const timer = setInterval(() => { void this.drain(); }, 5000);
    timer.unref();
    void this.drain();
    return async () => { clearInterval(timer); await this.running; };
  }
}
