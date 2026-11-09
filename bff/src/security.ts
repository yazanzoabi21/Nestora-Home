import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message = 'The request could not be completed.') {
    super(message);
  }
}

export const opaqueId = (): string => randomBytes(32).toString('base64url');
export const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex');
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export class Vault {
  private readonly key: Buffer;
  constructor(key: string) { this.key = Buffer.from(key, 'base64'); }
  seal(value: unknown, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  open<T>(value: string, context: string): T {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as T;
  }
}

/** Reject credentials at the egress boundary, including nested/renamed JWTs. */
export function assertTokenFree(value: unknown): void {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  if (/"(?:access_token|refresh_token|provider_token|provider_refresh_token|id_token|client_secret)"\s*:/i.test(json) ||
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(json) || /sb_secret_[A-Za-z0-9_-]+/.test(json)) {
    throw new HttpError(502, 'UNSAFE_UPSTREAM_RESPONSE');
  }
}

export function jsonBody(value: unknown): Record<string, unknown> {
  try {
    const parsed: unknown = Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : value;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* Return a neutral client error; never reflect input/passwords. */ }
  throw new HttpError(400, 'INVALID_BODY');
}

export function textField(body: Record<string, unknown>, key: string, max = 254): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new HttpError(400, 'INVALID_BODY');
  return value;
}
