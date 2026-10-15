const rejected = new Set(['AUTH_REQUIRED', 'UNTRUSTED_ACCOUNT', 'STALE_OR_INVALID_SESSION', 'MEMBER_NOT_READY', 'MEMBER_PROFILE_MISSING',
  'auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found']);
export function sessionFailure(error) {
  const value = error?.code || error?.message;
  return rejected.has(value) ? 'invalid' : value === 'STALE_SESSION' ? 'stale' : 'temporary';
}
