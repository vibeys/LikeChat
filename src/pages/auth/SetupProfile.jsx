// src/pages/auth/SetupProfile.jsx
import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { completeSetup } from '../../services/userService'
import { Button, Input, Spinner } from '../../components/UI'
import { Camera } from '@phosphor-icons/react'
import toast from 'react-hot-toast'

export default function SetupProfile() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    username: '',
    bio: '',
  })

  // Guards
  if (!user) return <Navigate to="/login" replace />
  if (user.setupComplete) return <Navigate to="/app/chats" replace />

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Photo must be under 5MB')
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.displayName.trim()) return toast.error('Display name is required')
    if (!form.username.trim()) return toast.error('Username is required')
    if (!/^[a-z0-9_.]{3,20}$/.test(form.username))
      return toast.error('Username: 3–20 chars, lowercase letters, numbers, _ or . only')

    setLoading(true)
    try {
      await completeSetup(user.uid, {
        displayName: form.displayName,
        username:    form.username,
        bio:         form.bio,
        photoFile:   photo,
      })
      await refreshUser()
      navigate('/app/chats')
    } catch (err) {
      console.error('Setup error:', err)
      toast.error(err.message || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'var(--bg-0)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 shadow-lg"
           style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>

        <div className="text-center mb-8">
          <img src="/logo.png" alt="LikeChat" className="mx-auto mb-4" style={{ width: '120px', height: 'auto' }} />
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-1)', fontFamily: '"Playfair Display", serif' }}>
            Set up your profile
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            This is how others will see you on LikeChat
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <label className="relative cursor-pointer group">
              <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
                   style={{ background: 'var(--bg-3)', border: '2px dashed var(--border-strong)' }}>
                {preview
                  ? <img src={preview} alt="preview" className="w-full h-full object-cover" />
                  : <Camera size={28} style={{ color: 'var(--text-3)' }} />
                }
              </div>
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0
                              group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={20} color="white" />
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Tap to upload a photo (optional)</p>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Display Name *
            </label>
            <Input
              placeholder="Your name"
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              maxLength={40}
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Username *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                    style={{ color: 'var(--text-3)' }}>@</span>
              <Input
                placeholder="your_username"
                value={form.username}
                onChange={e => setForm(f => ({
                  ...f,
                  username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '')
                }))}
                maxLength={20}
                className="pl-7"
              />
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              3–20 chars. Letters, numbers, _ and . only.
            </p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Bio <span style={{ color: 'var(--text-3)' }}>(optional)</span>
            </label>
            <textarea
              placeholder="Tell people a little about yourself..."
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              maxLength={120}
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <p className="text-xs text-right mt-0.5" style={{ color: 'var(--text-3)' }}>
              {form.bio.length}/120
            </p>
          </div>

          <Button type="submit" disabled={loading} className="w-full mt-2">
            {loading ? <Spinner size={18} /> : 'Continue to LikeChat →'}
          </Button>

        </form>
      </div>
    </div>
  )
}