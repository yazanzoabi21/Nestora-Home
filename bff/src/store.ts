import { createClient } from 'redis';
import { opaqueId, HttpError } from './security.js';

export interface Lease { key: string; token: string }
export interface PendingWrite { key: string; value: string; seconds: number }
export interface SharedStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, seconds: number, lease?: Lease): Promise<void>;
  delete(key: string, lease?: Lease, pending?: PendingWrite): Promise<void>;
  scanRevocations(cursor: string): Promise<{ cursor: string; keys: string[] }>;
  tryLease(key: string): Promise<Lease | null>;
  releaseLease(lease: Lease): Promise<void>;
  take(key: string): Promise<string | null>;
  count(key: string, seconds: number): Promise<number>;
  lock<T>(key: string, work: (lease: Lease) => Promise<T>, signal?: AbortSignal): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const FENCED_WRITE = `if redis.call('get',KEYS[2])~=ARGV[1] then return 0 end
redis.call('set',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1`;
const FENCED_DELETE = `if redis.call('get',KEYS[2])~=ARGV[1] then return 0 end
redis.call('del',KEYS[1]); return 1`;
const INVALIDATE = `if redis.call('get',KEYS[2])~=ARGV[1] then return 0 end
redis.call('set',KEYS[3],ARGV[2],'EX',ARGV[3],'NX'); redis.call('del',KEYS[1]); return 1`;
const RELEASE = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0`;
const RENEW = `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],30000) end return 0`;
const COUNT = `local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end return n`;

/** Production has no memory fallback. Redis failure fails closed. */
export class RedisStore implements SharedStore {
  private readonly client;
  constructor(url: string) {
    this.client = createClient({ url, socket: { connectTimeout: 5000,
      reconnectStrategy: (attempt) => Math.min(250 * 2 ** Math.min(attempt, 4), 4000),
    }, disableOfflineQueue: true });
    this.client.on('error', () => { /* No credentials, URLs or session records in logs. */ });
  }
  async connect(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.client.connect(), new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          void this.close();
          reject(new HttpError(503, 'STORE_STARTUP_UNAVAILABLE'));
        }, 15_000);
      })]);
    } finally { clearTimeout(timeout); }
  }
  async ping(): Promise<void> { await this.client.ping(); }
  async close(): Promise<void> { if (this.client.isOpen) this.client.destroy(); }
  get(key: string): Promise<string | null> { return this.client.get(key); }
  take(key: string): Promise<string | null> { return this.client.getDel(key); }
  async set(key: string, value: string, seconds: number, lease?: Lease): Promise<void> {
    if (!lease) { await this.client.set(key, value, { EX: seconds }); return; }
    if (await this.client.eval(FENCED_WRITE, { keys: [key, lease.key], arguments: [lease.token, value, String(seconds)] }) !== 1) {
      throw new HttpError(503, 'SESSION_LOCK_LOST');
    }
  }
  async delete(key: string, lease?: Lease, pending?: PendingWrite): Promise<void> {
    if (pending && !lease) throw new HttpError(503, 'SESSION_LOCK_REQUIRED');
    if (pending && lease) {
      if (await this.client.eval(INVALIDATE, { keys: [key, lease.key, pending.key],
        arguments: [lease.token, pending.value, String(pending.seconds)] }) !== 1) throw new HttpError(503, 'SESSION_LOCK_LOST');
      return;
    }
    if (!lease) { await this.client.del(key); return; }
    if (await this.client.eval(FENCED_DELETE, { keys: [key, lease.key], arguments: [lease.token] }) !== 1) {
      throw new HttpError(503, 'SESSION_LOCK_LOST');
    }
  }
  scanRevocations(cursor: string): Promise<{ cursor: string; keys: string[] }> {
    return this.client.scan(cursor, { MATCH: 'nestora:revocation:*', COUNT: 100 });
  }
  async tryLease(key: string): Promise<Lease | null> {
    const lease = { key: `${key}:lock`, token: opaqueId() };
    return await this.client.set(lease.key, lease.token, { NX: true, PX: 30_000 }) === 'OK' ? lease : null;
  }
  async releaseLease(lease: Lease): Promise<void> {
    await this.client.eval(RELEASE, { keys: [lease.key], arguments: [lease.token] });
  }
  async count(key: string, seconds: number): Promise<number> {
    return Number(await this.client.eval(COUNT, { keys: [key], arguments: [String(seconds)] }));
  }
  async lock<T>(key: string, work: (lease: Lease) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const lease = { key: `${key}:lock`, token: opaqueId() };
    const deadline = Date.now() + 12_000;
    for (;;) {
      signal?.throwIfAborted();
      if (await this.client.set(lease.key, lease.token, { NX: true, PX: 30_000 }) === 'OK') break;
      if (Date.now() > deadline) throw new HttpError(503, 'SESSION_BUSY');
      await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 40));
    }
    const renewal = setInterval(() => {
      void this.client.eval(RENEW, { keys: [lease.key], arguments: [lease.token] }).catch(() => undefined);
    }, 10_000);
    renewal.unref();
    try {
      signal?.throwIfAborted();
      return await work(lease);
    }
    finally {
      clearInterval(renewal);
      await this.client.eval(RELEASE, { keys: [lease.key], arguments: [lease.token] }).catch(() => undefined);
    }
  }
}
