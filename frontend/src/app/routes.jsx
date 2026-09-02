import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Home, NotFound } from './RouteViews.jsx'

const unfinishedRoutePaths = [
  '/login',
  '/register',
  '/bands/:bandId',
  '/bands/:bandId/members',
  '/bands/:bandId/events/new',
  '/bands/:bandId/events/:eventId',
  '/bands/:bandId/events/:eventId/edit',
  '/account',
]

export const routes = [
  {
    path: '/',
    element: <Home />,
  },
  ...unfinishedRoutePaths.map((path) => ({
    path,
    element: <Navigate to="/" replace />,
  })),
  {
    path: '*',
    element: <NotFound />,
  },
]

export const router = createBrowserRouter(routes)
