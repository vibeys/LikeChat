import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  // Still loading auth state
  if (loading) return null

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Logged in but setup not done
  if (!user.setupComplete) return <Navigate to="/setup" replace />

  return <Outlet />
}