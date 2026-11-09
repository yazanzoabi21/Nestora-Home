import { InjectionToken, inject } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import type { NestoraSupabaseClient } from '../models/auth/browser-auth.models';
import { createBffSupabaseClient } from '../services/bff/bff-supabase-client';
import { PublicCatalogChanges } from '../services/public-catalog-changes.service';

import { environment } from '../../../environments/environment';

const SESSION_PERSISTENCE_SUFFIX = '.session-only';

export class AuthPersistenceStorage {
  private readonly memoryStorage = new Map<string, string | null>();
  private rememberSession: boolean;
  private writesBlocked = false;

  get remembersSession(): boolean { return this.rememberSession; }

  constructor(private readonly authStorageKey: string) {
    const sessionStorage = this.browserStorage('sessionStorage');
    const localStorage = this.browserStorage('localStorage');
    const sessionOnly = this.readStorage(sessionStorage, this.persistenceKey) === 'true';
    const hasSessionOnlyAuth = this.readStorage(sessionStorage, this.authStorageKey) !== null;
    const hasPersistentAuth = this.readStorage(localStorage, this.authStorageKey) !== null;

    this.rememberSession = !sessionOnly && (hasPersistentAuth || !hasSessionOnlyAuth);
  }

  setRememberSession(rememberSession: boolean): void {
    this.writesBlocked = false;
    this.rememberSession = rememberSession;
    const sessionStorage = this.browserStorage('sessionStorage');

    this.writeStorage(sessionStorage, this.persistenceKey, rememberSession ? null : 'true');
  }

  resumeSessionWrites(): void {
    this.writesBlocked = false;
  }

  getItem(key: string): string | null {
    return this.memoryStorage.has(key)
      ? this.memoryStorage.get(key) ?? null
      : this.readStorage(this.activeStorage(), key);
  }

  clearAuthSession(): void {
    this.writesBlocked = true;
    for (const suffix of ['', '-user', '-code-verifier']) {
      this.removeItem(`${this.authStorageKey}${suffix}`);
    }
  }

  setItem(key: string, value: string): void {
    if (this.writesBlocked) return;
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
): NestoraSupabaseClient {
  const admin = storageKey === 'nestora-admin-auth';
  const changes = admin ? inject(PublicCatalogChanges) : null;
  if (environment.bffEnabled) {
    inject(ADMIN_AUTH_PERSISTENCE).clearAuthSession();
    inject(CUSTOMER_AUTH_PERSISTENCE).clearAuthSession();
    return createBffSupabaseClient(admin ? 'admin' : 'customer',
      environment.supabaseUrl, environment.supabaseAnonKey, storage, changes?.mutationCompleted.bind(changes));
  }
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    ...(changes ? { global: { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init);
      const request = input instanceof Request ? input : null;
      if (response.ok) changes.mutationCompleted(new URL(request?.url ?? String(input)).pathname,
        init?.method ?? request?.method ?? 'GET');
      return response;
    } } } : {}),
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

export const ADMIN_SUPABASE = new InjectionToken<NestoraSupabaseClient>('ADMIN_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-admin-auth', inject(ADMIN_AUTH_PERSISTENCE)),
});

export const CUSTOMER_SUPABASE = new InjectionToken<NestoraSupabaseClient>('CUSTOMER_SUPABASE', {
  providedIn: 'root',
  factory: () => createNestoraClient('nestora-customer-auth', inject(CUSTOMER_AUTH_PERSISTENCE)),
});
