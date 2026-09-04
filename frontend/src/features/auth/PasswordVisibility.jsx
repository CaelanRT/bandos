export function PasswordVisibility({ visible, onToggle, disabled, controls }) {
  return (
    <button type="button" disabled={disabled} aria-controls={controls} onClick={onToggle}>
      {visible ? 'Hide password' : 'Show password'}
    </button>
  )
}
