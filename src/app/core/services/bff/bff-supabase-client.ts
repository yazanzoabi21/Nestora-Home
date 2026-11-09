import { createClient } from '@supabase/supabase-js';
import type { AuthPersistenceStorage } from '../../tokens/supabase.tokens';
import type { NestoraSupabaseClient } from '../../models/auth/browser-auth.models';
import { BffApi, type BffAudience } from './bff-api';
import { BffAuthClient } from './bff-auth-client';
import { BffRealtimeChannel } from './bff-realtime-channel';

export const GUEST_OFFERS_HEADER = 'x-nestora-guest-offers';

export function createBffSupabaseClient(
  audience: BffAudience, supabaseUrl: string, publishableKey: string, persistence: AuthPersistenceStorage,
  onMutation?: (path: string, method: string) => void,
): NestoraSupabaseClient {
  const api = new BffApi(audience);
  const auth = new BffAuthClient(api, () => persistence.remembersSession);
  // SDK query/storage builders only. This SDK instance never has a user session.
  const builder = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const original = input instanceof Request ? input : null;
      const url = new URL(original?.url ?? String(input));
      if (url.origin !== new URL(supabaseUrl).origin ||
        !['/rest/v1/', '/storage/v1/'].some((prefix) => url.pathname.startsWith(prefix))) {
        throw new Error('Direct Supabase authentication is disabled in BFF mode.');
      }
      if (auth.logoutPending()) return new Response(JSON.stringify({ code: 'SESSION_REQUIRED', message: 'Sign-out is pending.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
      const method = init?.method ?? original?.method ?? 'GET';
      const headers = new Headers(init?.headers ?? original?.headers);
      const guestOffers = audience === 'customer' && method === 'GET' &&
        url.pathname === '/rest/v1/customer_offers' && headers.has(GUEST_OFFERS_HEADER);
      headers.delete(GUEST_OFFERS_HEADER);
      const response = await api.fetch(`/api/${audience}/supabase${url.pathname}${url.search}`, {
        ...(original ? { method: original.method, headers: original.headers,
          body: ['GET', 'HEAD'].includes(original.method) ? undefined : await original.arrayBuffer() } : {}), ...init, headers,
      }, guestOffers);
      if (response.ok) onMutation?.(url.pathname, method);
      return response;
    } },
  });
  return {
    auth, from: builder.from.bind(builder), rpc: builder.rpc.bind(builder), storage: builder.storage,
    channel: () => new BffRealtimeChannel(api), removeChannel: (channel) => channel.unsubscribe(),
  };
}
