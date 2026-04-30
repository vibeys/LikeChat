import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { login, loginWithGoogle } from '../../services/authService'
import toast from 'react-hot-toast'
import { Eye, EyeOff, MessageCircle } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email.trim()) return toast.error('Please enter your email')
    if (!form.password) return toast.error('Please enter your password')
    setLoading(true)
    try {
      const user = await login(form)
      if (!user.emailVerified) {
        toast('Please verify your email when you get a chance.', { icon: '📧' })
      }
      navigate('/app/chats')
    } catch (err) {
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          toast.error('Invalid email or password')
          break
        case 'auth/too-many-requests':
          toast.error('Too many attempts. Try again later.')
          break
        case 'auth/user-disabled':
          toast.error('This account has been disabled.')
          break
        default:
          toast.error('Sign in failed. Please try again.')
      }
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      navigate('/app/chats')
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('Google sign in failed. Please try again.')
      }
    }
    setGoogleLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #f0f7ff 0%, #e8f4fd 50%, #f5f5f5 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '22px',
            background: 'linear-gradient(145deg, #0099e6, #0077b5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(0,136,204,0.35)',
          }}>
            <MessageCircle size={32} color="white" fill="white" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0d1117', letterSpacing: '-0.4px', margin: 0 }}>
            LikeChat
          </h1>
          <p style={{ fontSize: '14px', color: '#708499', marginTop: '4px' }}>
            Sign in to continue
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '28px 24px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px', letterSpacing: '0.2px' }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #e0e0e0',
                  background: '#fafafa',
                  color: '#0d1117',
                  fontSize: '14.5px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s, background 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = '#0088cc'; e.target.style.background = '#fff' }}
                onBlur={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fafafa' }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px', letterSpacing: '0.2px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '11px 42px 11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #e0e0e0',
                    background: '#fafafa',
                    color: '#0d1117',
                    fontSize: '14.5px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s, background 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#0088cc'; e.target.style.background = '#fff' }}
                  onBlur={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fafafa' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#aaa', padding: '2px',
                    display: 'flex', alignItems: 'center',
                  }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Forgot */}
            <div style={{ textAlign: 'right', marginTop: '-6px' }}>
              <Link to="/forgot" style={{ fontSize: '13px', color: '#0088cc', fontWeight: '500', textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.target.style.textDecoration = 'none'}>
                Forgot password?
              </Link>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                background: loading ? '#7dc0e8' : 'linear-gradient(135deg, #0099e6, #0077cc)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 3px 12px rgba(0,136,204,0.35)',
                transition: 'transform 0.12s, box-shadow 0.12s',
                letterSpacing: '0.1px',
              }}
              onMouseEnter={e => { if (!loading) { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 5px 16px rgba(0,136,204,0.45)' }}}
              onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 3px 12px rgba(0,136,204,0.35)' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#ebebeb' }} />
            <span style={{ fontSize: '12px', color: '#aaa', fontWeight: '500', letterSpacing: '0.3px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#ebebeb' }} />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: '1.5px solid #e0e0e0',
              background: '#fff',
              color: '#333',
              fontSize: '14.5px',
              fontWeight: '500',
              cursor: googleLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'border-color 0.15s, background 0.15s, transform 0.12s',
              opacity: googleLoading ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!googleLoading) { e.currentTarget.style.borderColor = '#0088cc'; e.currentTarget.style.background = '#f8fbff'; e.currentTarget.style.transform = 'translateY(-1px)' }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Signing in…' : 'Continue with Google'}
          </button>
        </div>

        {/* Sign up link */}
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#708499' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#0088cc', fontWeight: '600', textDecoration: 'none' }}
                onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                onMouseLeave={e => e.target.style.textDecoration = 'none'}>
            Sign up
          </Link>
        </p>

      </div>
    </div>
  )
}