export interface BffConfig {
  enabled: boolean;
  production: boolean;
  origin: string;
  supabaseUrl: string;
  supabaseKey: string;
  redisUrl: string;
  encryptionKey: string;
  port: number;
  sessionSeconds: number;
  rememberedSeconds: number;
  idleSeconds: number;
  bodyLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BffConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing server configuration: ${name}`);
    return value;
  };
  const production = env['NODE_ENV'] === 'production';
  const origin = new URL(required('BFF_ORIGIN'));
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
    (origin.protocol !== 'https:' && (production || !['localhost', '127.0.0.1'].includes(origin.hostname)))) {
    throw new Error('BFF_ORIGIN must be a single HTTPS origin (localhost allowed in development).');
  }
  const supabaseUrl = new URL(required('SUPABASE_URL'));
  if (supabaseUrl.protocol !== 'https:') throw new Error('Supabase HTTPS is required.');
  const supabaseKey = required('SUPABASE_PUBLISHABLE_KEY');
  if (supabaseKey.startsWith('sb_secret_')) throw new Error('Service-role/secret keys are forbidden.');
  if (supabaseKey.startsWith('eyJ')) {
    const claims: unknown = JSON.parse(Buffer.from(supabaseKey.split('.')[1] ?? '', 'base64url').toString());
    if (!claims || typeof claims !== 'object' || !('role' in claims) || claims.role !== 'anon') {
      throw new Error('Only a publishable/anon key is permitted.');
    }
  } else if (!supabaseKey.startsWith('sb_publishable_')) throw new Error('Invalid publishable key.');
  const redisUrl = required('REDIS_URL');
  if (production && !redisUrl.startsWith('rediss://')) throw new Error('Production Redis must use TLS.');
  const encryptionKey = required('BFF_SESSION_KEY');
  if (Buffer.from(encryptionKey, 'base64').length !== 32) throw new Error('BFF_SESSION_KEY must be 32 random bytes, base64 encoded.');
  return {
    enabled: env['BFF_ENABLED'] === 'true', production, origin: origin.origin,
    supabaseUrl: supabaseUrl.origin, supabaseKey, redisUrl, encryptionKey,
    port: Number(env['PORT'] ?? 3000), sessionSeconds: 8 * 3600,
    rememberedSeconds: 30 * 86400, idleSeconds: 3600,
    bodyLimit: 100 * 1024 * 1024,
  };
}
