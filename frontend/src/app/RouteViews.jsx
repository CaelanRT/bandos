import { AppShell } from './AppShell.jsx'
import { Link } from 'react-router-dom'
import { useSession } from './sessionContext.js'
import { RegistrationForm } from '../features/auth/RegistrationForm.jsx'
import { LoginForm } from '../features/auth/LoginForm.jsx'

export function Home() {
  return (
    <AppShell>
      <h1>Bandos</h1>
    </AppShell>
  )
}

export function Login() {
  return (
    <AppShell>
      <h1>Login</h1>
      <LoginForm />
    </AppShell>
  )
}

export function Register() {
  return (
    <AppShell>
      <h1>Register</h1>
      <RegistrationForm />
    </AppShell>
  )
}

export function NotFound() {
  const { status } = useSession()
  return (
    <AppShell>
      <h1>Page not found</h1>
      <Link to={status === 'authenticated' ? '/' : '/login'}>
        {status === 'authenticated' ? 'Go to personal datebook' : 'Go to Login'}
      </Link>
    </AppShell>
  )
}
