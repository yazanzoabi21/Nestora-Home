import { AuthPersistenceStorage } from './supabase.tokens';
import { vi } from 'vitest';

describe('AuthPersistenceStorage', () => {
  const storageKey = 'test-auth-session';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('continues in memory when browser storage methods throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const storage = new AuthPersistenceStorage(storageKey);
    storage.setRememberSession(false);
    storage.setItem(storageKey, 'memory-session');
    expect(storage.getItem(storageKey)).toBe('memory-session');
    storage.removeItem(storageKey);
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it('does not restore a stale session after browser removal fails', () => {
    localStorage.setItem(storageKey, 'old-session');
    const storage = new AuthPersistenceStorage(storageKey);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    storage.removeItem(storageKey);
    expect(storage.getItem(storageKey)).toBeNull();
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

  it('clears auth companions in memory and suppresses late writes until explicit sign-in', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    const storage = new AuthPersistenceStorage(storageKey);
    for (const suffix of ['', '-user', '-code-verifier']) storage.setItem(storageKey + suffix, 'old');
    storage.clearAuthSession();
    for (const suffix of ['', '-user', '-code-verifier']) {
      storage.setItem(storageKey + suffix, 'late');
      expect(storage.getItem(storageKey + suffix)).toBeNull();
    }
    storage.setRememberSession(false);
    storage.setItem(storageKey, 'new');
    expect(storage.getItem(storageKey)).toBe('new');
  });
});
