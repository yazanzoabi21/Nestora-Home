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
  if (code === 'invalid_credentials' && (status === 400 || status === 401)) return 'AUTH.ERRORS.INVALID_CREDENTIALS';
  if (code === 'account_not_authorized' || code === 'user_banned') return 'AUTH.ERRORS.ACCESS_DENIED';
  if (['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used'].includes(String(code))) {
    return 'AUTH.ERRORS.SESSION_EXPIRED';
  }
  if (isTransientAuthError(error)) return 'AUTH.ERRORS.SERVICE_UNAVAILABLE';
  return authenticated ? 'AUTH.ERRORS.POST_LOGIN_LOAD_FAILED' : 'AUTH.ERRORS.SIGN_IN_FAILED';
}

export function accountAccessError(message: string): Error {
  return Object.assign(new Error(message), { status: 403, code: 'account_not_authorized' });
}
