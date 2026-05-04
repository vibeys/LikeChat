import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { register, loginWithGoogle } from '../../services/authService'
import { Button, Input } from '../../components/UI'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirm: ''
  })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.displayName.trim()) return toast.error('Please enter your name')
    if (!form.email.trim()) return toast.error('Please enter your email')
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')

    setLoading(true)
    try {
      await register({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password
      })
      toast.success('Account created! Check your email to verify.')
      navigate('/setup')
    } catch (err) {
      console.error('Register error:', err)
      switch (err.code) {
        case 'auth/email-already-in-use':
          toast.error('This email is already registered. Try signing in instead.')
          break
        case 'auth/invalid-email':
          toast.error('Invalid email address.')
          break
        case 'auth/weak-password':
          toast.error('Password is too weak. Use at least 6 characters.')
          break
        default:
          toast.error(err.message || 'Registration failed. Please try again.')
      }
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      // AuthContext will handle navigation based on setupComplete status via ProtectedRoute
      navigate('/app/chats')
    } catch (err) {
      console.error('Google sign in error:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup — no toast needed
      } else {
        toast.error(err.message || 'Google sign in failed. Please try again.')
      }
    }
    setGoogleLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4">
      <div
        className="w-full max-w-sm"
        style={{ animation: 'slideUp 0.2s ease-out' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="LikeChat" className="mx-auto mb-4" style={{ width: '120px', height: 'auto' }} />
          <h1 className="text-2xl font-semibold text-[var(--text-1)]" style={{ fontFamily: '"Playfair Display", serif' }}>LikeChat</h1>
          <p className="text-sm text-[var(--text-3)] mt-1">Create your account</p>
        </div>

        {/* Form */}
        <div className="bg-[var(--bg-1)] rounded-2xl p-6 shadow-sm border border-[var(--border)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Full name"
              name="displayName"
              type="text"
              placeholder="Juan dela Cruz"
              value={form.displayName}
              onChange={handleChange}
              required
            />
            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
            <Input
              label="Password"
              name="password"
              type="password"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={handleChange}
              required
            />
            <Input
              label="Confirm password"
              name="confirm"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={handleChange}
              required
            />

            {/* Password match indicator */}
            {form.confirm.length > 0 && (
              <p className="text-xs -mt-2"
                 style={{ color: form.password === form.confirm ? 'var(--success)' : 'var(--danger)' }}>
                {form.password === form.confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Create account
            </Button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-3)]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--bg-1)] hover:bg-[var(--bg-2)] transition-colors text-sm text-[var(--text-1)] disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>

        <p className="text-center text-sm text-[var(--text-3)] mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--accent)] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}