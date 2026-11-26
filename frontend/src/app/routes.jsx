import { createBrowserRouter } from 'react-router-dom'
import { ForgotPassword } from '../features/auth/ForgotPassword.jsx'
import { ResetPassword } from '../features/auth/ResetPassword.jsx'
import { VerifyEmail } from '../features/auth/VerifyEmail.jsx'
import { VerifyEmailChange } from '../features/auth/VerifyEmailChange.jsx'
import { SessionRoutes } from './SessionRoutes.jsx'
import { ProtectedRoute, SignedOutOnlyRoute } from './RouteAccess.jsx'
import { Login, NotFound, Register } from './RouteViews.jsx'

import { CreateBand } from '../features/bands/CreateBand.jsx'
import { BandsHome, BandWorkspace } from '../features/bands/BandViews.jsx'
import { Account } from '../features/account/Account.jsx'

const pageRoutes = [
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email-change', element: <VerifyEmailChange /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <BandsHome />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: (
      <SignedOutOnlyRoute>
        <Login />
      </SignedOutOnlyRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <SignedOutOnlyRoute>
        <Register />
      </SignedOutOnlyRoute>
    ),
  },
  { path: '/bands/new', element: <ProtectedRoute><CreateBand /></ProtectedRoute> },
  { path: '/bands/:bandId', element: <ProtectedRoute><BandWorkspace /></ProtectedRoute> },
  { path: '/bands/:bandId/members', element: <ProtectedRoute><BandWorkspace section="Members" /></ProtectedRoute> },
  { path: '/bands/:bandId/settings', element: <ProtectedRoute><BandWorkspace section="Settings" /></ProtectedRoute> },
  { path: '/bands/:bandId/events/:eventId', element: <ProtectedRoute><BandWorkspace section="Event" /></ProtectedRoute> },
  { path: '/bands/:bandId/events/:eventId/edit', element: <ProtectedRoute><BandWorkspace section="Edit event" /></ProtectedRoute> },
  { path: '/bands/:bandId/events/new', element: <ProtectedRoute><BandWorkspace section="Create event" /></ProtectedRoute> },
  { path: '/account', element: <ProtectedRoute><Account /></ProtectedRoute> },
  {
    path: '*',
    element: <NotFound />,
  },
]

export const routes = [{ element: <SessionRoutes />, children: pageRoutes }]

export const router = createBrowserRouter(routes)
