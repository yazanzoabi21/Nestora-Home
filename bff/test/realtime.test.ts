import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { config, TestStore, Upstream } from './helpers.js';

test('private Realtime authenticates upstream on the server, emits token-free SSE, and stops after logout', { timeout: 12_000 }, async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ server });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  let connection: WebSocket | undefined;
  let topic = ''; let joinRef: unknown;
  let joined!: () => void;
  const subscribed = new Promise<void>((resolve) => { joined = resolve; });
  let authenticatedUpstream = false;
  sockets.on('connection', (socket) => {
    connection = socket;
    socket.on('message', (bytes) => {
      const [join, ref, channel, event, data] = JSON.parse(bytes.toString()) as [unknown, unknown, string, string, Record<string, unknown>];
      if (event === 'phx_join') {
        topic = channel; joinRef = join;
        authenticatedUpstream = typeof data['access_token'] === 'string' && data['access_token'].startsWith('eyJ');
        const filters = (data['config'] as { postgres_changes: Record<string, unknown>[] }).postgres_changes;
        assert.equal(filters[0]?.['filter'], 'user_id=eq.customer-id');
        socket.send(JSON.stringify([join, ref, channel, 'phx_reply', { status: 'ok', response: {
          postgres_changes: filters.map((filter, index) => ({ ...filter, id: index + 1 })),
        } }]));
        joined();
      } else if (event === 'phx_leave' || event === 'heartbeat') {
        socket.send(JSON.stringify([join, ref, channel, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  const upstream = new Upstream();
  const app = await createApp({ ...config, supabaseUrl: `http://127.0.0.1:${address.port}` }, new TestStore(), upstream.fetch);
  const controller = new AbortController();
  try {
    const cookies = new Map<string, string>();
    let csrf = '';
    const request = async (url: string, body?: unknown) => {
      const response = await app.inject({ url, method: body === undefined ? 'GET' : 'POST', headers: {
        origin: config.origin, cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '),
        'x-csrf-token': csrf, 'content-type': 'application/json',
      }, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
      for (const cookie of response.cookies) cookies.set(cookie.name, cookie.value);
      return response;
    };
    csrf = (await request('/api/csrf')).json().csrfToken;
    assert.equal((await request('/api/customer/auth/login', { email: 'customer@example.com', password: 'correct' })).statusCode, 200);
    const subscription = await request('/api/customer/realtime', { changes: [{ schema: 'public', event: 'INSERT',
      table: 'customer_loyalty_points_ledger', filter: 'user_id=eq.victim' }] });
    assert.equal(subscription.statusCode, 200);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const bff = app.server.address(); assert.ok(bff && typeof bff !== 'string');
    const response = await fetch(`http://127.0.0.1:${bff.port}/api/customer/realtime/${subscription.json().id}`, {
      headers: { origin: config.origin, cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
    });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    await reader.read(); // Initial connected comment.
    await subscribed; await setImmediate();
    assert.equal(authenticatedUpstream, true);
    const emit = (points: number) => connection!.send(JSON.stringify([joinRef, null, topic, 'postgres_changes', {
      ids: [1], data: { schema: 'public', table: 'customer_loyalty_points_ledger', type: 'INSERT',
        commit_timestamp: '2026-11-03T00:00:00Z', columns: [{ name: 'user_id', type: 'text' }, { name: 'points', type: 'int4' }],
        record: { user_id: 'customer-id', points }, old_record: {}, errors: null },
    }]));
    emit(7);
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /"points":7/);
    assert.doesNotMatch(frame, /eyJ|access_token|refresh_token|server-only/);
    await request('/api/customer/auth/logout', {});
    emit(99);
    const afterLogout = await reader.read();
    assert.equal(afterLogout.done, true);
  } finally {
    controller.abort();
    await app.close();
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>((resolve) => sockets.close(() => server.close(() => resolve())));
  }
});
