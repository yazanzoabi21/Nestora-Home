import { InjectionToken, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

const SESSION_PERSISTENCE_SUFFIX = '.session-only';

export class AuthPersistenceStorage {
  private readonly memoryStorage = new Map<string, string>();
  private rememberSession: boolean;

  constructor(private readonly authStorageKey: string) {
    const sessionStorage = this.browserStorage('sessionStorage');
    const localStorage = this.browserStorage('localStorage');
    const sessionOnly = sessionStorage?.getItem(this.persistenceKey) === 'true';
    const hasSessionOnlyAuth = sessionStorage?.getItem(this.authStorageKey) !== null;
    const hasPersistentAuth = localStorage?.getItem(this.authStorageKey) !== null;

    this.rememberSession = !sessionOnly && (hasPersistentAuth || !hasSessionOnlyAuth);
  }

  setRememberSession(rememberSession: boolean): void {
    this.rememberSession = rememberSession;
    const sessionStorage = this.browserStorage('sessionStorage');

    if (rememberSession) {
      sessionStorage?.removeItem(this.persistenceKey);
    } else {
      sessionStorage?.setItem(this.persistenceKey, 'true');
    }
  }

  getItem(key: string): string | null {
    return this.activeStorage()?.getItem(key) ?? this.memoryStorage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const activeStorage = this.activeStorage();
    const inactiveStorage = this.inactiveStorage();

    activeStorage?.setItem(key, value);
    inactiveStorage?.removeItem(key);
    if (activeStorage) {
      this.memoryStorage.delete(key);
    } else {
      this.memoryStorage.set(key, value);
    }
  }

  removeItem(key: string): void {
    this.browserStorage('localStorage')?.removeItem(key);
    this.browserStorage('sessionStorage')?.removeItem(key);
    this.memoryStorage.delete(key);
  }

  private get persistenceKey(): string {
    return `${this.authStorageKey}${SESSION_PERSISTENCE_SUFFIX}`;
  }

  private activeStorage(): Storage | null {
    return this.browserStorage(this.rememberSession ? 'localStorage' : 'sessionStorage');
  }

  private inactiveStorage(): Storage | null {
    return this.browserStorage(this.rememberSession ? 'sessionStorage' : 'localStorage');
  }

  private browserStorage(type: 'localStorage' | 'sessionStorage'): Storage | null {
    try {
      return typeof window === 'undefined' ? null : window[type];
    } catch {
      return null;
    }
  }
}

function createNestoraClient(
  storageKey: string,
  storage: AuthPersistenceStorage,
): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      storageKey,
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const ADMIN_AUTH_PERSISTENCE = new InjectionToken<AuthPersistenceStorage>(
  'ADMIN_AUTH_PERSISTENCE',
  {
    providedIn: 'root',
    factory: () => new AuthPersistenceStorage('nestora-admin-auth'),
  },
);

export const CUSTOMER_AUTH_PERSISTENCE = new InjectionToken<AuthPersistenceStorage>(
  'CUSTOMER_AUTH_PERSISTENCE',
  {
    providedIn: 'root',
    factory: () => new AuthPersistenceStorage('nestora-customer-auth'),
  },
);

export const ADMIN_SUPABASE = new InjectionToken<SupabaseClient>('ADMIN_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-admin-auth', inject(ADMIN_AUTH_PERSISTENCE)),
});

export const CUSTOMER_SUPABASE = new InjectionToken<SupabaseClient>('CUSTOMER_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-customer-auth', inject(CUSTOMER_AUTH_PERSISTENCE)),
});
