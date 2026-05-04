// src/pages/auth/ForgotPass.jsx
import { useState } from 'react'
import { Link } from 'react-router'
import { sendReset } from '../../services/authService'
import { Button, Input } from '../../components/UI'
import { ArrowLeft, Mail } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ForgotPass() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return toast.error('Please enter your email')
    setLoading(true)
    try {
      await sendReset(email.trim())
      setSent(true)
    } catch (err) {
      console.error('Send reset error:', err)
      toast.error(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'var(--bg-0)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 shadow-lg"
           style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>

        {/* Back link */}
        <Link to="/login"
              className="inline-flex items-center gap-1.5 text-sm mb-6 hover:underline"
              style={{ color: 'var(--text-2)' }}>
          <ArrowLeft size={15} />
          Back to login
        </Link>

        {!sent ? (
          <>
            {/* Logo */}
            <div className="text-center mb-8">
              <img src="/logo.png" alt="LikeChat" className="mx-auto mb-4" style={{ width: '100px', height: 'auto' }} />
            </div>

            {/* Header */}
            <div className="mb-7">
              <h1 className="text-2xl font-semibold mb-1"
                  style={{ color: 'var(--text-1)', fontFamily: '"Playfair Display", serif' }}>Forgot password?</h1>
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-2)' }}>Email address</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          </>
        ) : (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'var(--accent-muted)' }}>
              <Mail size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-xl font-semibold mb-2"
                style={{ color: 'var(--text-1)' }}>Check your inbox</h2>
            <p className="text-sm mb-1" style={{ color: 'var(--text-2)' }}>
              We sent a reset link to:
            </p>
            <p className="text-sm font-medium mb-6"
               style={{ color: 'var(--accent)' }}>{email}</p>
            <p className="text-xs mb-6" style={{ color: 'var(--text-3)' }}>
              Didn't get it? Check spam or{' '}
              <button onClick={() => setSent(false)}
                      className="underline" style={{ color: 'var(--accent)' }}>
                try again
              </button>
            </p>
            <Link to="/login">
              <Button className="w-full">Back to login</Button>
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}