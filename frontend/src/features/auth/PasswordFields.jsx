import { useState } from 'react'
import { PasswordVisibility } from './PasswordVisibility.jsx'

export function PasswordFields({ values, onChange, errors, disabled, current = false }) {
  const [visible, setVisible] = useState({})
  const fields = [...(current ? [['currentPassword', 'Current password']] : []), ['newPassword', 'New password'], ['confirmation', 'Confirm new password']]
  return fields.map(([name, label]) => <div className="auth-field" key={name}>
    <label htmlFor={`password-${name}`}>{label}</label>
    <div className="password-control">
      <input id={`password-${name}`} name={name} type={visible[name] ? 'text' : 'password'}
        autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
        value={values[name]} disabled={disabled} aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `password-${name}-error` : undefined}
        onChange={event => onChange(name, event.target.value)} />
      <PasswordVisibility controls={`password-${name}`} visible={visible[name]} disabled={disabled}
        onToggle={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))} />
    </div>
    {errors[name] && <p id={`password-${name}-error`}>{errors[name]}</p>}
  </div>)
}
