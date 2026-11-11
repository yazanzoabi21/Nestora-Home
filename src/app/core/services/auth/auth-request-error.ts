/** Transport failures must not trigger session destruction or credential messages. */
export function isTransientAuthError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;
  if ('status' in error && typeof error.status === 'number' &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)) return true;
  return 'name' in error && ['AuthRetryableFetchError', 'AbortError', 'TimeoutError'].includes(String(error.name));
}

export function loginErrorKey(error: unknown, authenticated = false): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if ((code === 'INVALID_CREDENTIALS' && status === 401) ||
    (code === 'invalid_credentials' && (status === 400 || status === 401))) return 'AUTH.ERRORS.INVALID_CREDENTIALS';
  if (code === 'CSRF_FAILED' || (code === 'CSRF_UNAVAILABLE' && status === 403)) return 'AUTH.ERRORS.SECURITY_CHECK_FAILED';
  if (code === 'ORIGIN_DENIED') return 'AUTH.ERRORS.ORIGIN_DENIED';
  if (code === 'ACCOUNT_NOT_AUTHORIZED') return 'AUTH.ERRORS.ACCESS_DENIED';
  if (['SESSION_REQUIRED', 'SESSION_EXPIRED', 'SESSION_INVALID', 'REFRESH_FAILED'].includes(String(code)) && status === 401) {
    return 'AUTH.ERRORS.SESSION_EXPIRED';
  }
  if (code === 'LOGOUT_PENDING') return 'AUTH.ERRORS.LOGOUT_PENDING';
  if (isTransientAuthError(error)) return 'AUTH.ERRORS.SERVICE_UNAVAILABLE';
  return authenticated ? 'AUTH.ERRORS.POST_LOGIN_LOAD_FAILED' : 'AUTH.ERRORS.SIGN_IN_FAILED';
}
