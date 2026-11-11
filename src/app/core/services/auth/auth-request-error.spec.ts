import { BffRequestError } from '../bff/bff-api';
import { loginErrorKey } from './auth-request-error';

describe('login failure classification', () => {
  for (const [status, code, key] of [
    [401, 'INVALID_CREDENTIALS', 'INVALID_CREDENTIALS'],
    [400, 'invalid_credentials', 'INVALID_CREDENTIALS'],
    [403, 'CSRF_FAILED', 'SECURITY_CHECK_FAILED'],
    [403, 'ORIGIN_DENIED', 'ORIGIN_DENIED'],
    [403, 'ACCOUNT_NOT_AUTHORIZED', 'ACCESS_DENIED'],
    [401, 'SESSION_EXPIRED', 'SESSION_EXPIRED'],
    [503, 'AUTH_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
    [409, 'LOGOUT_PENDING', 'LOGOUT_PENDING'],
    [401, 'REQUEST_FAILED', 'SIGN_IN_FAILED'],
  ] as const) {
    it(`distinguishes ${code} from incorrect credentials`, () => {
      expect(loginErrorKey(new BffRequestError(status, code))).toBe('AUTH.ERRORS.' + key);
    });
  }
  it('never classifies unknown or network errors as incorrect credentials', () => {
    expect(loginErrorKey(new Error('Unknown'))).toBe('AUTH.ERRORS.SIGN_IN_FAILED');
    expect(loginErrorKey(new TypeError('Offline'))).toBe('AUTH.ERRORS.SERVICE_UNAVAILABLE');
    expect(loginErrorKey(new Error('Navigation'), true)).toBe('AUTH.ERRORS.POST_LOGIN_LOAD_FAILED');
  });
});
