/**
 * Maps Firebase auth error codes to i18n keys for friendly messages.
 */
export function authErrorKey(error: unknown): string {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'errors.invalidCredentials'
    case 'auth/email-already-in-use':
      return 'errors.emailInUse'
    case 'auth/weak-password':
      return 'errors.weakPassword'
    default:
      return 'errors.generic'
  }
}
