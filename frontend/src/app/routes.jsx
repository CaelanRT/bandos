import { createBrowserRouter, Navigate } from 'react-router-dom'
import { SessionRoutes } from './SessionRoutes.jsx'
import { ProtectedRoute, SignedOutOnlyRoute } from './RouteAccess.jsx'
import { Login, NotFound, Register } from './RouteViews.jsx'

import { BandsHome, BandWorkspace } from '../features/bands/BandViews.jsx'

const unfinishedRoutePaths = [
  '/bands/:bandId/members',
  '/bands/:bandId/events/new',
  '/bands/:bandId/events/:eventId',
  '/bands/:bandId/events/:eventId/edit',
  '/account',
]

const pageRoutes = [
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
  { path: '/bands/:bandId', element: <ProtectedRoute><BandWorkspace /></ProtectedRoute> },
  ...unfinishedRoutePaths.map((path) => ({
    path,
    element: (
      <ProtectedRoute>
        <Navigate to="/" replace />
      </ProtectedRoute>
    ),
  })),
  {
    path: '*',
    element: <NotFound />,
  },
]

export const routes = [{ element: <SessionRoutes />, children: pageRoutes }]

export const router = createBrowserRouter(routes)
