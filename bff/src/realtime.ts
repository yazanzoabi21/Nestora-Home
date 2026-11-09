import type { FastifyInstance } from 'fastify';
import { Sessions, cookieName } from './sessions.js';
import type { BffConfig } from './config.js';
import { assertTokenFree, fingerprint, HttpError, jsonBody, opaqueId, validId } from './security.js';
import { publicRealtimeTables } from './policy.js';

interface Change { event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; schema: 'public'; table: string; filter?: string }
interface Subscription { changes: Change[]; sessionHash: string | null; browserHash: string }

export function registerRealtime(app: FastifyInstance, config: BffConfig, sessions: Sessions): void {
  const connections = new Set<() => void>();
  app.addHook('preClose', async () => { for (const close of connections) close(); });
  for (const audience of ['admin', 'customer'] as const) {
    const key = (id: string): string => `nestora:subscription:${audience}:${fingerprint(id)}`;
    app.post(`/api/${audience}/realtime`, async (request) => {
      if (await sessions.store.count(`nestora:rate:realtime:${fingerprint(request.ip)}`, 60) > 30) {
        throw new HttpError(429, 'RATE_LIMITED');
      }
      const sid = request.cookies[cookieName(audience)];
      const resolved = sid ? await sessions.resolve(audience, sid) : null;
      const body = jsonBody(request.body);
      const raw = body['changes'];
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new HttpError(400, 'INVALID_SUBSCRIPTION');
      const changes: Change[] = raw.map((input: unknown) => {
        const change = jsonBody(input);
        if (change['schema'] !== 'public' || typeof change['table'] !== 'string' ||
          typeof change['event'] !== 'string' || !['*', 'INSERT', 'UPDATE', 'DELETE'].includes(change['event'])) throw new HttpError(400, 'INVALID_SUBSCRIPTION');
        const result: Change = { schema: 'public', event: change['event'] as Change['event'], table: change['table'] };
        if (publicRealtimeTables.has(result.table)) {
          if (change['filter'] !== undefined) throw new HttpError(400, 'INVALID_SUBSCRIPTION');
          return result;
        }
        if (audience !== 'customer' || !resolved || result.table !== 'customer_loyalty_points_ledger' || result.event !== 'INSERT') {
          throw new HttpError(403, 'SUBSCRIPTION_NOT_ALLOWED');
        }
        result.filter = `user_id=eq.${resolved.session.user.id}`; // Never trust a browser owner filter.
        return result;
      });
      const id = opaqueId();
      const subscription: Subscription = { changes, sessionHash: sid ? fingerprint(sid) : null,
        browserHash: fingerprint(request.cookies['__Host-nestora-csrf'] ?? '') };
      await sessions.store.set(key(id), sessions.vault.seal(subscription, key(id)), 60);
      return { id };
    });

    app.get(`/api/${audience}/realtime/:id`, async (request, reply) => {
      if (connections.size >= 1000) throw new HttpError(503, 'STREAM_CAPACITY');
      if ((request.headers.origin && request.headers.origin !== config.origin) || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'ORIGIN_DENIED');
      const id = (request.params as { id: string }).id;
      if (!validId(id)) throw new HttpError(400, 'INVALID_SUBSCRIPTION');
      const raw = await sessions.store.take(key(id));
      if (!raw) throw new HttpError(401, 'SUBSCRIPTION_EXPIRED');
      const subscription = sessions.vault.open<Subscription>(raw, key(id));
      const sid = request.cookies[cookieName(audience)];
      if (subscription.sessionHash !== (sid ? fingerprint(sid) : null) ||
        subscription.browserHash !== fingerprint(request.cookies['__Host-nestora-csrf'] ?? '')) throw new HttpError(401, 'SESSION_REQUIRED');
      const resolved = sid ? await sessions.resolve(audience, sid, false, false) : null;
      let jwt = resolved?.session.accessToken ?? config.supabaseKey;
      const client = sessions.gateway.userClient(async () => sid
        ? (await sessions.resolve(audience, sid, false, false)).session.accessToken : config.supabaseKey);
      await client.realtime.setAuth(jwt);
      const channel = client.channel(`bff-${opaqueId()}`);
      let closed = false;
      let validating = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        connections.delete(close);
        clearInterval(heartbeat);
        void client.removeAllChannels();
        reply.raw.end();
      };
      async function authorize(): Promise<void> {
        if (sid) {
          const current = await sessions.resolve(audience, sid, false, false);
          if (current.session.accessToken !== jwt) {
            jwt = current.session.accessToken;
            await client.realtime.setAuth(jwt);
          }
        }
      }
      for (const [index, change] of subscription.changes.entries()) {
        channel.on('postgres_changes', { ...change, event: change.event as '*' }, (payload) => {
          void (async () => {
            await authorize();
            if (closed || reply.raw.writableLength > 256 * 1024) return close();
            const data = { index, payload };
            assertTokenFree(data);
            reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
          })().catch(close);
        });
      }
      const heartbeat = setInterval(() => {
        if (validating || closed) return;
        validating = true;
        void authorize().then(() => {
          if (!closed) reply.raw.write(': heartbeat\n\n');
        }).catch(close).finally(() => { validating = false; });
      }, 15_000);
      heartbeat.unref();
      connections.add(close);
      request.raw.on('aborted', close);
      reply.raw.on('close', close);
      reply.hijack();
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store',
        'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
      reply.raw.write(': connected\n\n');
      channel.subscribe((status) => { if (['CHANNEL_ERROR', 'CLOSED', 'TIMED_OUT'].includes(status)) close(); });
    });
  }
}
