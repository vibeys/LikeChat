import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './UI'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  // Still loading auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-0)' }}>
        <Spinner />
      </div>
    )
  }

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Logged in but setup not done
  if (!user.setupComplete) return <Navigate to="/setup" replace />

  return <Outlet />
}