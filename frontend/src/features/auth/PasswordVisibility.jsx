export function PasswordVisibility({ visible, onToggle, disabled, controls }) {
  return (
    <button
      className="password-visibility"
      type="button"
      disabled={disabled}
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-controls={controls}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  )
}
