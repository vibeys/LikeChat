// src/pages/auth/UpdatePass.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { Button, Input } from '../../components/UI'
import { Eye, EyeSlash, ArrowLeft, ShieldCheck } from '@phosphor-icons/react'
import toast from 'react-hot-toast'

export default function UpdatePass() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [form, setForm] = useState({ password: '', confirm: '' })

  // Get oobCode from URL ?oobCode=xxx
  const oobCode = new URLSearchParams(window.location.search).get('oobCode')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.password) return toast.error('Enter a new password')
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    if (!oobCode) return toast.error('Invalid or expired reset link')

    setLoading(true)
    try {
      await verifyPasswordResetCode(auth, oobCode)
      await confirmPasswordReset(auth, oobCode, form.password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      console.error('Password reset error:', err)
      if (err.code === 'auth/expired-action-code')
        toast.error('Reset link has expired. Please request a new one.')
      else if (err.code === 'auth/invalid-action-code')
        toast.error('Invalid reset link. Please request a new one.')
      else
        toast.error(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'var(--bg-0)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 shadow-lg"
           style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>

        {!done ? (
          <>
            {/* Logo */}
            <div className="text-center mb-8">
              <img src="/logo.png" alt="LikeChat" className="mx-auto" style={{ width: '100px', height: 'auto' }} />
            </div>

            {/* Back */}
            <Link to="/login"
                  className="inline-flex items-center gap-1.5 text-sm mb-6 hover:underline"
                  style={{ color: 'var(--text-2)' }}>
              <ArrowLeft size={15} />
              Back to login
            </Link>

            {/* Header */}
            <div className="mb-7">
              <h1 className="text-2xl font-semibold mb-1"
                  style={{ color: 'var(--text-1)', fontFamily: '"Playfair Display", serif' }}>Set new password</h1>
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                Choose a strong password for your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* New password */}
              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-2)' }}>New password</label>
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-3)' }}>
                    {showPass ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium mb-1.5"
                       style={{ color: 'var(--text-2)' }}>Confirm password</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat your password"
                    value={form.confirm}
                    onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-3)' }}>
                    {showConfirm ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Match indicator */}
                {form.confirm.length > 0 && (
                  <p className="text-xs mt-1"
                     style={{ color: form.password === form.confirm ? 'var(--success)' : 'var(--danger)' }}>
                    {form.password === form.confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {/* Strength hint */}
              {form.password.length > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs"
                     style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}>
                  Tip: Use a mix of letters, numbers, and symbols for a stronger password.
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? 'Updating...' : 'Update password'}
              </Button>

            </form>
          </>
        ) : (
          /* Success state */
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                 style={{ background: 'var(--accent-muted)' }}>
              <ShieldCheck size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-xl font-semibold mb-2"
                style={{ color: 'var(--text-1)' }}>Password updated!</h2>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Redirecting you to login...
            </p>
          </div>
        )}

      </div>
    </div>
  )
}