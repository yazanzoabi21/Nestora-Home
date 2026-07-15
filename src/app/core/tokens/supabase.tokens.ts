import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

function createNestoraClient(storageKey: string): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const ADMIN_SUPABASE = new InjectionToken<SupabaseClient>('ADMIN_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-admin-auth'),
});

export const CUSTOMER_SUPABASE = new InjectionToken<SupabaseClient>('CUSTOMER_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-customer-auth'),
});
