import { createBrowserRouter, Navigate } from 'react-router'
import App from './App'
import AppShell from './pages/app/AppShell'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import SetupProfile from './pages/auth/SetupProfile'
import ForgotPass from './pages/auth/ForgotPass'
import UpdatePass from './pages/auth/UpdatePass'
import ChatWindow from './pages/app/ChatWindow'
import GroupPage from './pages/app/GroupPage'
import FriendsPage from './pages/app/FriendsPage'
import ProfilePage from './pages/app/ProfilePage'
import SettingsPage from './pages/app/SettingsPage'
import NotificationsPage from './pages/app/NotificationsPage'
import ProtectedRoute from './components/ProtectedRoute'

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <Navigate to="/app/chats" replace /> },

      // Auth (public)
      { path: '/login',       element: <LoginPage /> },
      { path: '/register',    element: <RegisterPage /> },
      { path: '/forgot',      element: <ForgotPass /> },
      { path: '/update-pass', element: <UpdatePass /> },
      { path: '/setup',       element: <SetupProfile /> },

      // App (protected) — AppShell wraps all app pages
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              // Default right panel — empty state
              { path: '/app/chats',              element: null },
              // Chat open
              { path: '/app/chats/:convId',      element: <ChatWindow /> },
              // Other panels
              { path: '/app/group/:convId',      element: <GroupPage /> },
              { path: '/app/friends',            element: <FriendsPage /> },
              { path: '/app/notifications',      element: <NotificationsPage /> },
              { path: '/app/profile',            element: <ProfilePage /> },
              { path: '/app/settings',           element: <SettingsPage /> },
            ],
          },
        ],
      },

      { path: '*', element: <Navigate to="/app/chats" replace /> },
    ],
  },
])