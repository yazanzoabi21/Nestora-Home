import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { AsyncLocalStorage } from 'node:async_hooks';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import type { Session } from '@supabase/supabase-js';
import type { BffConfig } from './config.js';
import type { SharedStore } from './store.js';
import { HttpError, assertTokenFree, fingerprint, jsonBody, opaqueId, sameSecret, textField, validId } from './security.js';
import { Sessions, cookieName, type ResolvedSession, type SessionTiming } from './sessions.js';
import { SupabaseGateway, credentialFailure, type Audience } from './supabase.js';
import { checkProfileMutation, dataRoute, publicRpcs } from './policy.js';
import { registerRealtime } from './realtime.js';

interface Flow { kind: 'oauth' | 'signup' | 'recovery'; remember: boolean; storage: [string, string][]; owner?: string }
interface FlowReference { id: string; expiresAt: number; sessionId?: string; cancelled?: boolean }
interface FlowLink { key: string; id: string }
interface RecoveryConfirmation { previousSessionHash: string; expiresAt: number; links: FlowLink[] }
const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const };
const csrfCookie = '__Host-nestora-csrf';
const recoveryCookie = '__Host-nestora-customer-recovery-confirmation';
const recoveryKey = (id: string): string => `nestora:recovery-confirmation:{${fingerprint(id)}}`;
const flowCookie = (audience: Audience): string => `__Host-nestora-${audience}-flow`;
const flowKey = (audience: Audience, id: string): string => `nestora:flow:${audience}:${fingerprint(id)}`;
const flowOwnerKey = (audience: Audience, owner: string): string => `nestora:flow-owner:${audience}:{${owner}}`;
const readCookie = (request: FastifyRequest, name: string): string | undefined => request.cookies[name];

function isExpiredDataToken(status: number, bytes: Buffer): boolean {
  if (status !== 401 || bytes.length > 4096) return false;
  try {
    const error = JSON.parse(bytes.toString()) as { code?: string; message?: string } | null;
    return !!error && ['PGRST301', 'PGRST303'].includes(error.code ?? '') &&
      typeof error.message === 'string' && /\b(?:jwt (?:is )?expired|expired (?:jwt|exp(?:iration)? claim))\b/i.test(error.message);
  } catch {
    return false;
  }
}

export async function createApp(config: BffConfig, store: SharedStore, fetcher?: typeof globalThis.fetch) {
  const traces = !config.production && process.env['BFF_TRACE_TIMING'] === '1'
    ? new AsyncLocalStorage<Record<string, number>>() : undefined;
  const measure = async <T>(metric: string, work: () => Promise<T>): Promise<T> => {
    const trace = traces?.getStore();
    if (!trace) return work();
    const started = performance.now();
    try { return await work(); }
    finally { trace[metric] = (trace[metric] ?? 0) + performance.now() - started; }
  };
  if (traces) {
    store = new Proxy(store, {
      get(target, property) {
        const method = Reflect.get(target, property);
        if (typeof method !== 'function') return method;
        if (['get', 'set', 'delete', 'count', 'take', 'ping'].includes(String(property))) {
          return (...args: unknown[]) => measure('redis_commands', () => method.apply(target, args));
        }
        return method.bind(target);
      },
    });
  }
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, requestTimeout: 300_000,
    trustProxy: ['127.0.0.1', '::1'] });
  const upstreamFetch = fetcher ?? globalThis.fetch;
  const gateway = new SupabaseGateway(config, traces ? (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const metric = path.startsWith('/auth/') ? 'auth_http' : path === '/rest/v1/profiles'
      ? 'profile_http' : 'data_http';
    return measure(metric, () => upstreamFetch(input, init));
  } : upstreamFetch);
  const sessions = new Sessions(store, gateway, config);
  const stopRevocations = sessions.revocations.start();
  app.addHook('onClose', stopRevocations);
  const requestStarts = new WeakMap<FastifyRequest, number>();
  const requestTraces = new WeakMap<FastifyRequest, Record<string, number>>();
  if (traces) {
    app.addHook('onRequest', (request, _reply, done) => {
      const trace = {};
      requestTraces.set(request, trace);
      traces.run(trace, done);
    });
    app.addHook('onResponse', async (request, reply) => {
      const started = requestStarts.get(request);
      if (started === undefined) return;
      console.info('BFF timing', JSON.stringify({
        route: request.routeOptions.url ?? '(unmatched)', method: request.method,
        status: reply.statusCode, totalMs: Math.round(performance.now() - started),
        phases: reply.getHeader('server-timing'), ...requestTraces.get(request),
      }));
    });
  }
  function reportTiming(request: FastifyRequest, reply: FastifyReply, timing?: SessionTiming, upstreamMs?: number): void {
    const started = requestStarts.get(request);
    if (started === undefined) return;
    const total = performance.now() - started;
    const queue = timing?.queueMs ?? 0;
    const validation = timing?.validationMs ?? 0;
    const upstream = upstreamMs ?? 0;
    reply.header('Server-Timing', [
      ['bff', Math.max(0, total - queue - validation - upstream)],
      ['session_queue', queue], ['supabase_auth', validation], ['supabase_data', upstream],
    ].map(([name, duration]) => `${name};dur=${Number(duration).toFixed(1)}`).join(', '));
  }
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof HttpError;
    const tooLarge = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413;
    const status = known ? error.status : tooLarge ? 413 : 503;
    return reply.code(status).send({ code: known ? error.code : status === 413 ? 'BODY_TOO_LARGE' : 'SERVICE_UNAVAILABLE',
      message: known ? error.message : 'The request could not be completed.' });
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!config.production) requestStarts.set(request, performance.now());
    reply.header('Cache-Control', 'private, no-store, max-age=0').header('Pragma', 'no-cache').header('Vary', 'Cookie');
    if (!config.enabled && request.url !== '/api/health') throw new HttpError(503, 'BFF_DISABLED');
    const n = await measure('rate_limit', () => store.count(`nestora:rate:all:${fingerprint(request.ip)}`, 60));
    if (n > 600) throw new HttpError(429, 'RATE_LIMITED');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const token = request.headers['x-csrf-token'];
      const stored = readCookie(request, csrfCookie);
      if (request.headers.origin !== config.origin || request.headers['sec-fetch-site'] === 'cross-site') {
        throw new HttpError(403, 'ORIGIN_DENIED');
      }
      if (typeof token !== 'string' || !validId(stored) || !validId(token) || !sameSecret(token, stored)) {
        throw new HttpError(403, 'CSRF_FAILED');
      }
    }
  });
  app.addHook('onSend', async (_request, _reply, payload) => {
    if (typeof payload === 'string') assertTokenFree(payload);
    return payload;
  });
  app.get('/api/health', async () => {
    await store.ping();
    return { ready: true, enabled: config.enabled, ...(!config.production ? { origin: config.origin } : {}) };
  });
  app.get('/api/csrf', async (request, reply) => {
    if (request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.headers.origin && request.headers.origin !== config.origin)) throw new HttpError(403, 'ORIGIN_DENIED');
    const current = readCookie(request, csrfCookie);
    const token = validId(current) ? current : opaqueId();
    reply.setCookie(csrfCookie, token, cookieOptions);
    return { csrfToken: token };
  });

  function issue(reply: FastifyReply, audience: Audience, id: string, result: ResolvedSession): void {
    const maxAge = Math.max(1, Math.floor((result.session.absoluteExpiresAt - Date.now()) / 1000));
    reply.setCookie(cookieName(audience), id, { ...cookieOptions, ...(audience === 'admin' || result.session.remember ? { maxAge } : {}) });
  }
  function view(result: ResolvedSession) {
    return { user: result.session.user, session: { user: result.session.user }, profile: result.profile, recovery: result.session.recovery };
  }
  async function establish(request: FastifyRequest, reply: FastifyReply, audience: Audience, tokens: Session, remember: boolean, recovery = false,
    beforeIssue?: (id: string) => Promise<void>) {
    let createdId: string | undefined;
    try {
      const created = await sessions.create(audience, tokens, remember, recovery);
      createdId = created.id;
      await sessions.logout(audience, readCookie(request, cookieName(audience)));
      await beforeIssue?.(created.id);
      issue(reply, audience, created.id, created.result);
      return view(created.result);
    } catch (error: unknown) {
      if (createdId) await sessions.logout(audience, createdId).catch(() => undefined);
      await sessions.revoke(audience, tokens);
      throw error;
    }
  }
  async function authRate(request: FastifyRequest, email?: string): Promise<void> {
    const ip = await store.count(`nestora:rate:auth:${fingerprint(request.ip)}`, 60);
    const account = email ? await store.count(`nestora:rate:account:${fingerprint(email.toLowerCase())}`, 600) : 0;
    if (ip > 20 || account > 20) throw new HttpError(429, 'RATE_LIMITED');
  }
  async function flowReferences(key: string): Promise<FlowReference[]> {
    const raw = await store.get(key);
    return raw ? sessions.vault.open<FlowReference[]>(raw, key).filter((item) => item.expiresAt > Date.now()) : [];
  }
  async function linkSession(links: FlowLink[], sessionId: string): Promise<void> {
    for (const link of links) await store.lock(link.key, async (lease) => {
      const references = await flowReferences(link.key);
      const reference = references.find((item) => item.id === link.id && !item.cancelled && !item.sessionId);
      if (!reference) throw new HttpError(400, 'FLOW_EXPIRED');
      reference.sessionId = sessionId;
      reference.expiresAt = Date.now() + 3600_000;
      await store.set(link.key, sessions.vault.seal(references, link.key), 3600, lease);
    });
  }
  async function currentCustomer(request: FastifyRequest): Promise<ResolvedSession | null> {
    const id = readCookie(request, cookieName('customer'));
    if (!validId(id)) return null;
    try { return await sessions.resolve('customer', id, true, false); }
    catch (error: unknown) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) return null;
      throw error;
    }
  }
  async function pendingRecovery(request: FastifyRequest) {
    const id = readCookie(request, recoveryCookie);
    if (!validId(id)) throw new HttpError(400, 'RECOVERY_CONFIRMATION_INVALID');
    const key = recoveryKey(id);
    const raw = await store.get(key);
    if (!raw) throw new HttpError(400, 'RECOVERY_CONFIRMATION_INVALID');
    const pending = sessions.vault.open<RecoveryConfirmation>(raw, key);
    const current = readCookie(request, cookieName('customer'));
    if (pending.expiresAt <= Date.now() || !validId(current) || pending.previousSessionHash !== fingerprint(current) ||
      !await currentCustomer(request)) throw new HttpError(409, 'RECOVERY_CONFIRMATION_CHANGED');
    for (const link of pending.links) {
      if (!(await flowReferences(link.key)).some((item) => item.id === link.id && item.sessionId === id && !item.cancelled)) {
        throw new HttpError(400, 'FLOW_EXPIRED');
      }
    }
    const result = await sessions.resolve('customer', id, true, false);
    if (!result.session.recovery) throw new HttpError(403, 'RECOVERY_SESSION_REQUIRED');
    return { id, key, result };
  }
  async function saveFlow(request: FastifyRequest, reply: FastifyReply, audience: Audience, flow: Flow, id = opaqueId()): Promise<void> {
    const seconds = flow.kind === 'oauth' ? 600 : 3600;
    // Mutation requests already passed CSRF validation. Reuse its stable browser cookie,
    // but keep only its fingerprint in the encrypted, audience-specific flow records.
    const owner = fingerprint(readCookie(request, csrfCookie)!);
    const key = flowOwnerKey(audience, owner);
    await store.lock(key, async (lease) => {
      const references = await flowReferences(key);
      references.push({ id, expiresAt: Date.now() + seconds * 1000 });
      await store.set(flowKey(audience, id), sessions.vault.seal({ ...flow, owner }, flowKey(audience, id)), seconds);
      await store.set(key, sessions.vault.seal(references, key), 3600, lease);
    });
    reply.setCookie(flowCookie(audience), id, { ...cookieOptions, maxAge: seconds });
  }
  async function invalidateFlows(request: FastifyRequest, audience: Audience): Promise<string[]> {
    const browser = readCookie(request, csrfCookie)!;
    const key = flowOwnerKey(audience, fingerprint(browser));
    const linkedSessions = await store.lock(key, async (lease) => {
      const references = await flowReferences(key);
      // Keep bounded cancellation references so a partial failure can retry cleanup
      // of a callback session that the logout request's older cookie did not contain.
      for (const reference of references) reference.cancelled = true;
      if (references.length) await store.set(key, sessions.vault.seal(references, key), 3600, lease);
      for (const reference of references) await store.delete(flowKey(audience, reference.id));
      return references.flatMap((reference) => reference.sessionId ? [reference.sessionId] : []);
    });
    // Also remove a pre-upgrade flow or a flow whose browser cookie was renewed.
    const current = readCookie(request, flowCookie(audience));
    if (validId(current)) await store.delete(flowKey(audience, current));
    return linkedSessions;
  }

  for (const audience of ['admin', 'customer'] as const) {
    const base = `/api/${audience}/auth`;
    app.post(`${base}/login`, async (request, reply) => {
      const body = jsonBody(request.body);
      const email = textField(body, 'email');
      await authRate(request, email);
      const { data, error } = await gateway.authClient().auth.signInWithPassword({ email, password: textField(body, 'password', 4096) });
      if (error || !data.session) throw credentialFailure(error);
      return establish(request, reply, audience, data.session, body['remember'] === true);
    });
    app.get(`${base}/session`, async (request, reply) => {
      const timing = config.production ? undefined : {};
      const id = readCookie(request, cookieName(audience));
      if (!id) {
        reportTiming(request, reply);
        return { user: null, session: null, profile: null, recovery: false };
      }
      try {
        const result = await sessions.resolve(audience, id, true, true, timing);
        reportTiming(request, reply, timing);
        return view(result);
      }
      catch (error: unknown) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) reply.clearCookie(cookieName(audience), cookieOptions);
        throw error;
      }
    });
    app.post(`${base}/logout`, async (request, reply) => {
      const linkedSessions = await invalidateFlows(request, audience);
      if (audience === 'customer') {
        const pending = readCookie(request, recoveryCookie);
        if (validId(pending)) { await store.delete(recoveryKey(pending)); linkedSessions.push(pending); }
      }
      let remoteRevocationConfirmed = true;
      let revocationStatus: 'confirmed' | 'already_invalid' | 'uncertain' | 'not_required' = 'not_required';
      let revocationRetryScheduled = false;
      for (const id of new Set([...linkedSessions, readCookie(request, cookieName(audience))])) {
        const revoked = await sessions.logout(audience, id);
        remoteRevocationConfirmed = ['confirmed', 'not_required'].includes(revoked.status) && remoteRevocationConfirmed;
        revocationRetryScheduled ||= revoked.retryScheduled;
        if (revoked.status === 'uncertain' || (revoked.status === 'already_invalid' && revocationStatus !== 'uncertain') ||
          (revoked.status === 'confirmed' && revocationStatus === 'not_required')) revocationStatus = revoked.status;
      }
      reply.clearCookie(cookieName(audience), cookieOptions).clearCookie(flowCookie(audience), cookieOptions);
      if (audience === 'customer') reply.clearCookie(recoveryCookie, cookieOptions);
      return { localSessionCleared: true, remoteRevocationConfirmed, revocationStatus, revocationRetryScheduled };
    });
    app.post(`${base}/refresh`, async (request) => view(await sessions.resolve(audience, readCookie(request, cookieName(audience)))));
    app.post(`${base}/password`, async (request, reply) => {
      await authRate(request);
      const resolved = await sessions.resolve(audience, readCookie(request, cookieName(audience)), true);
      if (!resolved.session.recovery) throw new HttpError(403, 'RECOVERY_SESSION_REQUIRED');
      const password = textField(jsonBody(request.body), 'password', 4096);
      if (password.length < 6) throw new HttpError(400, 'INVALID_PASSWORD');
      const upstream = await gateway.fetch(`${config.supabaseUrl}/auth/v1/user`, { method: 'PUT',
        headers: { apikey: config.supabaseKey, Authorization: `Bearer ${resolved.session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!upstream.ok) throw new HttpError(400, 'PASSWORD_UPDATE_FAILED');
      if (resolved.session.recovery) {
        await sessions.logout(audience, readCookie(request, cookieName(audience)));
        reply.clearCookie(cookieName(audience), cookieOptions);
      }
      return { user: resolved.session.user };
    });

    app.head(`${base}/callback`, async (_request, reply) => reply.header('Allow', 'GET').code(405).send());
    app.get(`${base}/callback`, { exposeHeadRoute: false }, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const browserFlow = readCookie(request, flowCookie(audience));
      const id = query['flow'] ?? browserFlow;
      const callback = new URL('/auth/customer-callback', config.origin);
      let recovery = false;
      let tokens: Session | undefined;
      let createdId: string | undefined;
      let exchangeLease: Awaited<ReturnType<SharedStore['tryLease']>> = null;
      let recipient: FlowLink | undefined;
      try {
        if (audience !== 'customer' || !validId(id)) throw new HttpError(400, 'FLOW_INVALID');
        const code = textField(query, 'code', 4096);
        if (query['error'] !== undefined || query['error_description'] !== undefined) throw new HttpError(400, 'FLOW_INVALID');
        const raw = await store.get(flowKey(audience, id));
        if (!raw) throw new HttpError(400, 'FLOW_EXPIRED');
        const flow = sessions.vault.open<Flow>(raw, flowKey(audience, id));
        // Legacy records cannot prove browser ownership. Require a fresh flow.
        if (!flow.owner) throw new HttpError(400, 'FLOW_EXPIRED');
        const ownerKey = flowOwnerKey(audience, flow.owner);
        const browserBound = browserFlow === id;
        if (flow.kind === 'oauth' && !browserBound) throw new HttpError(400, 'FLOW_INVALID');
        recovery = flow.kind === 'recovery';
        const previous = recovery ? await currentCustomer(request) : null;
        const links: FlowLink[] = [{ key: ownerKey, id }];
        const browserNonce = readCookie(request, csrfCookie);
        if (validId(browserNonce) && fingerprint(browserNonce) !== flow.owner) {
          recipient = { key: flowOwnerKey(audience, fingerprint(browserNonce)), id: opaqueId() };
          const link = recipient;
          await store.lock(link.key, async (lease) => {
            const references = await flowReferences(link.key);
            references.push({ id: link.id, expiresAt: Date.now() + 600_000 });
            await store.set(link.key, sessions.vault.seal(references, link.key), 3600, lease);
          });
          links.push(recipient);
        }
        // A busy exchange is rejected without consuming the flow or waiting on a session lock.
        exchangeLease = await store.tryLease(flowKey(audience, id));
        if (!exchangeLease) throw new HttpError(409, 'FLOW_IN_PROGRESS');
        const { data, error } = await gateway.authClient(new Map(flow.storage)).auth.exchangeCodeForSession(code);
        if (error || !data.session?.user.id) throw new HttpError(401, 'FLOW_INVALID');
        tokens = data.session;
        // Consume only after a valid exchange, under the same cancellation lock as logout.
        await store.lock(ownerKey, async () => {
          const references = await flowReferences(ownerKey);
          if (!references.some((item) => item.id === id && !item.sessionId && !item.cancelled) || !await store.take(flowKey(audience, id))) {
            throw new HttpError(400, 'FLOW_EXPIRED');
          }
        });
        if (flow.kind === 'signup' && !browserBound) {
          // Confirming an email in another browser must not silently log that
          // browser into an account chosen by a link sender (login CSRF).
          await sessions.revoke(audience, data.session);
          return reply.code(303).redirect('/auth/customer-login');
        }
        const created = await sessions.create(audience, tokens, flow.remember, recovery);
        createdId = created.id;
        await linkSession(links, created.id);
        if (previous) await sessions.resolve(audience, readCookie(request, cookieName(audience)), true, false);
        if (recovery && previous) {
          const pending: RecoveryConfirmation = { previousSessionHash: fingerprint(readCookie(request, cookieName(audience))!),
            expiresAt: created.result.session.absoluteExpiresAt, links };
          const seconds = Math.max(1, Math.floor((pending.expiresAt - Date.now()) / 1000));
          await store.set(recoveryKey(created.id), sessions.vault.seal(pending, recoveryKey(created.id)), seconds);
          reply.setCookie(recoveryCookie, created.id, { ...cookieOptions, maxAge: seconds });
          callback.pathname = '/auth/customer-reset-password';
          callback.searchParams.set('confirmation', 'required');
        } else {
          await sessions.logout(audience, readCookie(request, cookieName(audience)));
          issue(reply, audience, created.id, created.result);
        }
        if (browserBound) reply.clearCookie(flowCookie(audience), cookieOptions);
        if (recovery) callback.pathname = '/auth/customer-reset-password';
      } catch {
        if (createdId) await sessions.logout(audience, createdId).catch(() => undefined);
        if (tokens) await sessions.revoke(audience, tokens);
        if (recipient) {
          const link = recipient;
          await store.lock(link.key, async (lease) => {
            const references = (await flowReferences(link.key)).filter((item) => item.id !== link.id);
            if (references.length) await store.set(link.key, sessions.vault.seal(references, link.key), 3600, lease);
            else await store.delete(link.key, lease);
          }).catch(() => undefined);
        }
        callback.pathname = recovery ? '/auth/customer-reset-password' : '/auth/customer-callback';
        callback.searchParams.set('error', 'authentication_failed');
      } finally {
        if (exchangeLease) await store.releaseLease(exchangeLease).catch(() => undefined);
      }
      return reply.code(303).redirect(callback.pathname + callback.search);
    });
  }

  app.get('/api/customer/auth/recovery-confirmation', async (request) => {
    if (request.headers['sec-fetch-site'] === 'cross-site' ||
      (request.headers.origin && request.headers.origin !== config.origin)) throw new HttpError(403, 'ORIGIN_DENIED');
    const pending = await pendingRecovery(request);
    return { email: pending.result.session.user.email ?? '' };
  });
  app.post('/api/customer/auth/recovery-confirmation', async (request, reply) => {
    if (jsonBody(request.body)['confirm'] !== true) throw new HttpError(400, 'CONFIRMATION_REQUIRED');
    const pending = await pendingRecovery(request);
    await store.lock(pending.key, async () => {
      if (!await store.take(pending.key)) throw new HttpError(409, 'RECOVERY_CONFIRMATION_USED');
    });
    await sessions.logout('customer', readCookie(request, cookieName('customer')));
    issue(reply, 'customer', pending.id, pending.result);
    reply.clearCookie(recoveryCookie, cookieOptions);
    return { confirmed: true };
  });

  app.post('/api/customer/auth/oauth', async (request, reply) => {
    await authRate(request);
    const memory = new Map<string, string>();
    const { data, error } = await gateway.authClient(memory).auth.signInWithOAuth({ provider: 'google', options: {
      redirectTo: `${config.origin}/api/customer/auth/callback`, skipBrowserRedirect: true,
    } });
    if (error || !data.url) throw new HttpError(503, 'OAUTH_UNAVAILABLE');
    const url = new URL(data.url);
    if (url.origin !== config.supabaseUrl || url.pathname !== '/auth/v1/authorize' || url.searchParams.get('response_type') === 'token') {
      throw new HttpError(502, 'OAUTH_INVALID');
    }
    await saveFlow(request, reply, 'customer', { kind: 'oauth', remember: jsonBody(request.body)['remember'] === true, storage: [...memory] });
    return { url: data.url };
  });
  app.post('/api/customer/auth/register', async (request, reply) => {
    const body = jsonBody(request.body);
    const email = textField(body, 'email');
    await authRate(request, email);
    const memory = new Map<string, string>();
    const flowId = opaqueId();
    const { data, error } = await gateway.authClient(memory).auth.signUp({ email, password: textField(body, 'password', 4096), options: {
      emailRedirectTo: `${config.origin}/api/customer/auth/callback?flow=${flowId}`, data: {
        full_name: textField(body, 'fullName', 200), phone: textField(body, 'phone', 50), role: 'customer',
      },
    } });
    if (error || !data.user) throw new HttpError(400, 'REGISTRATION_FAILED');
    if (data.session) return establish(request, reply, 'customer', data.session, true);
    await saveFlow(request, reply, 'customer', { kind: 'signup', remember: true, storage: [...memory] }, flowId);
    // Do not reveal whether the address already existed; no real user metadata.
    return { confirmationRequired: true, user: null, session: null };
  });
  app.post('/api/customer/auth/recovery', async (request, reply) => {
    const email = textField(jsonBody(request.body), 'email');
    await authRate(request, email);
    const memory = new Map<string, string>();
    const flowId = opaqueId();
    await gateway.authClient(memory).auth.resetPasswordForEmail(email, { redirectTo: `${config.origin}/api/customer/auth/callback?flow=${flowId}` });
    await saveFlow(request, reply, 'customer', { kind: 'recovery', remember: false, storage: [...memory] }, flowId);
    return { accepted: true };
  });

  app.post('/api/customer/auth/password/change', async (request) => {
    await authRate(request);
    const resolved = await sessions.resolve('customer', readCookie(request, cookieName('customer')));
    const body = jsonBody(request.body);
    const password = textField(body, 'newPassword', 4096);
    if (password.length < 6 || !resolved.session.user.email) throw new HttpError(400, 'INVALID_PASSWORD');
    const proof = await gateway.authClient().auth.signInWithPassword({
      email: resolved.session.user.email, password: textField(body, 'currentPassword', 4096),
    });
    if (proof.error || !proof.data.session) {
      if (proof.error?.code === 'invalid_credentials') throw new HttpError(400, 'CURRENT_PASSWORD_INVALID');
      throw credentialFailure(proof.error);
    }
    try {
      if (proof.data.user?.id !== resolved.session.user.id) throw new HttpError(403, 'SESSION_INVALID');
      const changed = await gateway.fetch(`${config.supabaseUrl}/auth/v1/user`, { method: 'PUT',
        headers: { apikey: config.supabaseKey, Authorization: `Bearer ${resolved.session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!changed.ok) throw new HttpError(400, 'PASSWORD_UPDATE_FAILED');
      return { updated: true };
    } finally { await sessions.revoke('customer', proof.data.session); }
  });

  for (const audience of ['admin', 'customer'] as const) {
    for (const prefix of ['rest/v1', 'storage/v1']) {
    app.route({ method: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'], url: `/api/${audience}/supabase/${prefix}/*`,
      bodyLimit: prefix === 'storage/v1' ? config.bodyLimit : 2 * 1024 * 1024, handler: async (request, reply) => {
      const timing = config.production ? undefined : {};
      const cancellation = audience === 'admin' && ['GET', 'HEAD'].includes(request.method) ? new AbortController() : undefined;
      if (cancellation) {
        reply.raw.once('close', () => { if (!reply.raw.writableFinished) cancellation.abort(); });
      }
      const raw = `${prefix}/${(request.params as { '*': string })['*']}`;
      const route = dataRoute(audience, raw, request.method);
      const query = new URL(request.raw.url ?? '', config.origin).searchParams;
      for (const header of ['accept-profile', 'content-profile']) {
        if (request.headers[header] && request.headers[header] !== 'public') throw new HttpError(403, 'SCHEMA_NOT_ALLOWED');
      }
      const id = readCookie(request, cookieName(audience));
      let resolved: ResolvedSession | null = null;
      if (id) {
        try { resolved = await sessions.resolve(audience, id, false, true, timing, cancellation?.signal); }
        catch (error: unknown) {
          const publicRead = route.publicAccess && (['GET', 'HEAD'].includes(request.method) || publicRpcs.has(route.resource));
          if (!publicRead || !(error instanceof HttpError) || ![401, 403].includes(error.status)) throw error;
          reply.clearCookie(cookieName(audience), cookieOptions);
        }
      }
      if (!resolved && !route.publicAccess) throw new HttpError(401, 'SESSION_REQUIRED');
      if (route.kind === 'table' && route.resource === 'profiles' && !['GET', 'HEAD'].includes(request.method)) {
        if (!resolved || request.method !== 'PATCH') throw new HttpError(403, 'PROFILE_FIELDS_RESTRICTED');
        checkProfileMutation(request.body, audience, resolved.session.user.id, query);
      }
      if (route.kind === 'storage' && audience === 'customer') {
        const userId = resolved?.session.user.id;
        const ownerPath = `storage/v1/object/avatars/${userId}/`;
        const removal = request.method === 'DELETE' && raw === 'storage/v1/object/avatars';
        if (removal) {
          const prefixes = jsonBody(request.body)['prefixes'];
          if (!userId || !Array.isArray(prefixes) || prefixes.length < 1 || prefixes.length > 100 ||
            prefixes.some((prefix: unknown) => typeof prefix !== 'string' || !prefix.startsWith(`${userId}/`) || prefix.includes('..'))) {
            throw new HttpError(403, 'STORAGE_NOT_ALLOWED');
          }
        } else if (route.resource !== 'avatars' || !raw.startsWith(ownerPath)) throw new HttpError(403, 'STORAGE_NOT_ALLOWED');
      }
      const headers = new Headers({ apikey: config.supabaseKey,
        Authorization: `Bearer ${resolved?.session.accessToken ?? config.supabaseKey}` });
      for (const name of ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'x-upsert', 'cache-control']) {
        const value = request.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      const url = `${config.supabaseUrl}/${route.path}${query.size ? `?${query}` : ''}`;
      cancellation?.signal.throwIfAborted();
      const upstreamStarted = performance.now();
      const send = () => gateway.fetch(url, { method: request.method, headers,
        signal: cancellation?.signal,
        ...(!['GET', 'HEAD'].includes(request.method) && Buffer.isBuffer(request.body) ? { body: request.body as unknown as BodyInit } : {}),
      });
      let response = await send();
      let bytes = Buffer.from(await response.arrayBuffer());
      if (resolved && prefix === 'rest/v1' && isExpiredDataToken(response.status, bytes)) {
        // PostgREST rejected the JWT before executing the query or mutation.
        // Renew once under the session lease; concurrent failures reuse the rotation.
        cancellation?.signal.throwIfAborted();
        resolved = await sessions.recoverAccessToken(audience, id, resolved.session.accessToken);
        headers.set('Authorization', `Bearer ${resolved.session.accessToken}`);
        response = await send();
        bytes = Buffer.from(await response.arrayBuffer());
        if (isExpiredDataToken(response.status, bytes)) throw new HttpError(503, 'TOKEN_RENEWAL_UNAVAILABLE');
      }
      for (const name of ['content-type', 'content-range', 'range-unit', 'preference-applied']) {
        const value = response.headers.get(name);
        if (value) reply.header(name, value);
      }
      const upstreamMs = performance.now() - upstreamStarted;
      if (bytes.length > config.bodyLimit) throw new HttpError(502, 'UPSTREAM_TOO_LARGE');
      // Never relay upstream cookies, redirects, Authorization or auth endpoints.
      if (/json|text\//i.test(response.headers.get('content-type') ?? '')) {
        assertTokenFree(bytes.toString('utf8'));
      }
      const session = resolved?.session;
      if (session && [session.accessToken, session.refreshToken].some((secret) => bytes.includes(Buffer.from(secret)))) {
        throw new HttpError(502, 'UNSAFE_UPSTREAM_RESPONSE');
      }
      reportTiming(request, reply, timing, upstreamMs);
      return reply.code(response.status).send(bytes);
    } });
    }
    app.all(`/api/${audience}/supabase/*`, async () => { throw new HttpError(403, 'ROUTE_NOT_ALLOWED'); });
  }
  registerRealtime(app, config, sessions);
  return app;
}
