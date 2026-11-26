// Match the server's new-password contract; preserve passwords exactly as entered.
export function validateNewPassword(value) {
  if (typeof value !== 'string' || value.length === 0) return 'Enter your password.'
  if (value.length < 8) return 'Use at least 8 characters.'
  if (new TextEncoder().encode(value).length > 72) return 'Use at most 72 UTF-8 bytes.'
}
