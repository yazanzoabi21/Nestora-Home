import { AuthApiError } from '@supabase/supabase-js';
import { loginErrorKey } from './auth-request-error';

describe('Supabase login failure classification', () => {
  for (const [status, code, key] of [
    [400, 'invalid_credentials', 'INVALID_CREDENTIALS'],
    [403, 'account_not_authorized', 'ACCESS_DENIED'],
    [401, 'session_expired', 'SESSION_EXPIRED'],
    [503, 'unexpected_failure', 'SERVICE_UNAVAILABLE'],
    [401, 'unknown', 'SIGN_IN_FAILED'],
  ] as const) {
    it(`distinguishes ${code} from incorrect credentials`, () => {
      expect(loginErrorKey(new AuthApiError('Provider failure', status, code))).toBe('AUTH.ERRORS.' + key);
    });
  }
  it('never classifies unknown or network errors as incorrect credentials', () => {
    expect(loginErrorKey(new Error('Unknown'))).toBe('AUTH.ERRORS.SIGN_IN_FAILED');
    expect(loginErrorKey(new TypeError('Offline'))).toBe('AUTH.ERRORS.SERVICE_UNAVAILABLE');
    expect(loginErrorKey(new Error('Navigation'), true)).toBe('AUTH.ERRORS.POST_LOGIN_LOAD_FAILED');
  });
});
