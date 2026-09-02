import { AuthPersistenceStorage } from './supabase.tokens';

describe('AuthPersistenceStorage', () => {
  const storageKey = 'test-auth-session';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores remembered Supabase sessions in local storage', () => {
    const storage = new AuthPersistenceStorage(storageKey);

    storage.setRememberSession(true);
    storage.setItem(storageKey, 'persistent-session');

    expect(localStorage.getItem(storageKey)).toBe('persistent-session');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('stores non-remembered Supabase sessions in session storage', () => {
    const storage = new AuthPersistenceStorage(storageKey);

    storage.setRememberSession(false);
    storage.setItem(storageKey, 'tab-session');

    expect(sessionStorage.getItem(storageKey)).toBe('tab-session');
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('restores the session-only storage choice during an OAuth redirect', () => {
    const initialStorage = new AuthPersistenceStorage(storageKey);
    initialStorage.setRememberSession(false);
    initialStorage.setItem(storageKey, 'oauth-session');

    const redirectedStorage = new AuthPersistenceStorage(storageKey);

    expect(redirectedStorage.getItem(storageKey)).toBe('oauth-session');
  });
});
