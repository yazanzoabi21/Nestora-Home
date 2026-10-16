import { InjectionToken, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

const SESSION_PERSISTENCE_SUFFIX = '.session-only';

export class AuthPersistenceStorage {
  private readonly memoryStorage = new Map<string, string | null>();
  private rememberSession: boolean;

  constructor(private readonly authStorageKey: string) {
    const sessionStorage = this.browserStorage('sessionStorage');
    const localStorage = this.browserStorage('localStorage');
    const sessionOnly = this.readStorage(sessionStorage, this.persistenceKey) === 'true';
    const hasSessionOnlyAuth = this.readStorage(sessionStorage, this.authStorageKey) !== null;
    const hasPersistentAuth = this.readStorage(localStorage, this.authStorageKey) !== null;

    this.rememberSession = !sessionOnly && (hasPersistentAuth || !hasSessionOnlyAuth);
  }

  setRememberSession(rememberSession: boolean): void {
    this.rememberSession = rememberSession;
    const sessionStorage = this.browserStorage('sessionStorage');

    this.writeStorage(sessionStorage, this.persistenceKey, rememberSession ? null : 'true');
  }

  getItem(key: string): string | null {
    return this.memoryStorage.has(key)
      ? this.memoryStorage.get(key) ?? null
      : this.readStorage(this.activeStorage(), key);
  }

  setItem(key: string, value: string): void {
    const activeStorage = this.activeStorage();
    const inactiveStorage = this.inactiveStorage();

    const persisted = this.writeStorage(activeStorage, key, value);
    this.writeStorage(inactiveStorage, key, null);
    if (persisted) {
      this.memoryStorage.delete(key);
    } else {
      this.memoryStorage.set(key, value);
    }
  }

  removeItem(key: string): void {
    this.writeStorage(this.browserStorage('localStorage'), key, null);
    this.writeStorage(this.browserStorage('sessionStorage'), key, null);
    // Prevent a failed browser-storage removal from restoring a signed-out session.
    this.memoryStorage.set(key, null);
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

  private readStorage(storage: Storage | null, key: string): string | null {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeStorage(storage: Storage | null, key: string, value: string | null): boolean {
    if (!storage) return false;
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      return true;
    } catch {
      return false;
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
