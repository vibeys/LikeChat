// src/pages/app/ProfilePage.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { updateProfile, uploadProfilePhoto } from '../../services/userService'
import { logout, deleteAccount } from '../../services/authService'
import { getInitials, getAvatarColor } from '../../lib/utils'
import {
  Camera,
  PencilSimple,
  SignOut,
  Trash,
  User,
  At,
  FileText,
  EnvelopeSimple,
  ShieldCheck,
  X,
  Check,
  Warning,
  Moon,
  Sun,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [editModal,   setEditModal]   = useState(null) // 'name' | 'bio' | 'delete'
  const [editValue,   setEditValue]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [photoLoading,setPhotoLoading]= useState(false)
  const [darkMode,    setDarkMode]    = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light'
  )
  const fileRef = useRef(null)

  const ac = getAvatarColor(user?.displayName || '')

  // ── Photo upload ──────────────────────────────────────────────────────────
  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB')

    setPhotoLoading(true)
    try {
      await uploadProfilePhoto(user.uid, file)
      await refreshUser()
      toast.success('Photo updated!')
    } catch (err) {
      toast.error(err.message || 'Failed to update photo')
    } finally {
      setPhotoLoading(false)
      e.target.value = ''
    }
  }

  // ── Edit field ────────────────────────────────────────────────────────────
  function openEdit(field) {
    setEditValue(field === 'name' ? (user?.displayName || '') : (user?.bio || ''))
    setEditModal(field)
  }

  async function handleSave() {
    const trimmed = editValue.trim()
    if (editModal === 'name' && !trimmed) return toast.error('Name cannot be empty')
    setSaving(true)
    try {
      const data = editModal === 'name'
        ? { displayName: trimmed }
        : { bio: trimmed }
      await updateProfile(user.uid, data)
      await refreshUser()
      toast.success('Profile updated!')
      setEditModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Dark mode toggle ──────────────────────────────────────────────────────
  function toggleTheme() {
    const next = darkMode ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
    setDarkMode(!darkMode)
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    try { await logout(); navigate('/login') }
    catch { toast.error('Failed to logout') }
  }

  // ── Delete account ────────────────────────────────────────────────────────
  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAccount()
      navigate('/login')
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.page}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={S.hero}>
        {/* Avatar */}
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <motion.div
            whileHover={{ scale: 1.04 }}
            style={{ cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} style={S.avatar} />
            ) : (
              <div style={{ ...S.avatar, background: ac.bg, color: ac.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700 }}>
                {getInitials(user?.displayName || '?')}
              </div>
            )}
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => fileRef.current?.click()}
            disabled={photoLoading}
            style={S.cameraBtn}
            title="Change photo"
          >
            {photoLoading
              ? <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.65s linear infinite' }} />
              : <Camera size={15} weight="fill" />
            }
          </motion.button>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
        </div>

        {/* Name + username */}
        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            {user?.displayName || 'Your Name'}
          </h2>
          {user?.username && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              @{user.username}
            </p>
          )}
          {user?.bio && (
            <p style={{ margin: '8px auto 0', fontSize: '13px', color: 'rgba(255,255,255,0.65)', maxWidth: '260px', lineHeight: 1.5 }}>
              {user.bio}
            </p>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={S.content}>

        {/* Account section */}
        <SectionLabel label="Account" />
        <div style={S.card}>
          <SettingsRow
            Icon={User}
            label="Display Name"
            value={user?.displayName || '—'}
            onClick={() => openEdit('name')}
            actionIcon={<PencilSimple size={15} />}
          />
          <SettingsRow
            Icon={FileText}
            label="Bio"
            value={user?.bio || 'Add a bio'}
            valueDim={!user?.bio}
            onClick={() => openEdit('bio')}
            actionIcon={<PencilSimple size={15} />}
          />
          <SettingsRow
            Icon={At}
            label="Username"
            value={user?.username ? `@${user.username}` : '—'}
            noBorder
          />
        </div>

        {/* Contact section */}
        <SectionLabel label="Contact" />
        <div style={S.card}>
          <SettingsRow
            Icon={EnvelopeSimple}
            label="Email"
            value={user?.email || '—'}
          />
          <SettingsRow
            Icon={ShieldCheck}
            label="Email verified"
            value={user?.emailVerified ? 'Verified' : 'Not verified'}
            valueColor={user?.emailVerified ? 'var(--success)' : 'var(--warning)'}
            noBorder
          />
        </div>

        {/* Preferences */}
        <SectionLabel label="Preferences" />
        <div style={S.card}>
          <SettingsRow
            Icon={darkMode ? Moon : Sun}
            label="Dark mode"
            value={darkMode ? 'On' : 'Off'}
            onClick={toggleTheme}
            actionIcon={
              <div style={{
                width: 40, height: 22, borderRadius: 999,
                background: darkMode ? 'var(--primary)' : 'var(--bg-4)',
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                <motion.div
                  animate={{ x: darkMode ? 19 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
                />
              </div>
            }
            noBorder
          />
        </div>

        {/* Danger */}
        <SectionLabel label="Account Actions" />
        <div style={S.card}>
          <SettingsRow
            Icon={SignOut}
            label="Sign out"
            labelColor="var(--text-primary)"
            onClick={handleLogout}
            noBorder={false}
          />
          <SettingsRow
            Icon={Trash}
            label="Delete account"
            labelColor="var(--danger)"
            iconColor="var(--danger)"
            iconBg="rgba(239,68,68,0.1)"
            onClick={() => setEditModal('delete')}
            noBorder
          />
        </div>

      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editModal && editModal !== 'delete' && (
          <motion.div
            style={S.overlay}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditModal(null)}
          >
            <motion.div
              style={S.modal}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={S.modalHeader}>
                <span style={S.modalTitle}>
                  {editModal === 'name' ? 'Edit Display Name' : 'Edit Bio'}
                </span>
                <motion.button
                  style={S.modalClose}
                  onClick={() => setEditModal(null)}
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <X size={15} />
                </motion.button>
              </div>

              {editModal === 'bio' ? (
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Write something about yourself..."
                  maxLength={160}
                  rows={4}
                  autoFocus
                  style={{ ...S.input, resize: 'none', lineHeight: 1.5 }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              ) : (
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Your display name"
                  maxLength={50}
                  autoFocus
                  style={S.input}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                />
              )}

              {editModal === 'bio' && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                  {editValue.length}/160
                </p>
              )}

              <motion.button
                onClick={handleSave}
                disabled={saving}
                whileHover={!saving ? { scale: 1.02, y: -1 } : {}}
                whileTap={!saving ? { scale: 0.97 } : {}}
                style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }}
              >
                <Check size={16} weight="bold" />
                {saving ? 'Saving...' : 'Save'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {editModal === 'delete' && (
          <motion.div
            style={S.overlay}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditModal(null)}
          >
            <motion.div
              style={S.modal}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--danger)' }}>
                  <Warning size={28} weight="fill" />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Delete Account</h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This will permanently delete your account, messages, and all data. This cannot be undone.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  onClick={() => setEditModal(null)}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleDelete}
                  disabled={saving}
                  whileHover={!saving ? { scale: 1.02 } : {}} whileTap={!saving ? { scale: 0.97 } : {}}
                  style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }) {
  return (
    <p style={{ margin: '20px 0 6px 4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
      {label}
    </p>
  )
}

function SettingsRow({ Icon, label, value, valueDim, valueColor, labelColor, iconColor, iconBg, onClick, actionIcon, noBorder }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={onClick ? { x: 2, backgroundColor: 'var(--bg-secondary)' } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 14px', border: 'none', textAlign: 'left',
        background: 'transparent', cursor: onClick ? 'pointer' : 'default',
        borderBottom: noBorder ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: iconBg || 'var(--primary-light)',
        color: iconColor || 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: labelColor || 'var(--text-primary)' }}>
          {label}
        </p>
        {value && (
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: valueColor || (valueDim ? 'var(--text-tertiary)' : 'var(--text-secondary)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </p>
        )}
      </div>
      {actionIcon && (
        <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {actionIcon}
        </div>
      )}
    </motion.button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '28px 20px 22px',
    background: 'linear-gradient(160deg, #020202 0%, #0d0d0d 55%, #001428 100%)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    gap: '6px',
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2.5px solid rgba(30,144,255,0.35)',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 28, height: 28,
    borderRadius: '50%',
    background: 'var(--primary)',
    border: '2.5px solid #0d0d0d',
    color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(30,144,255,0.4)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 16px 32px',
    WebkitOverflowScrolling: 'touch',
  },
  card: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
    padding: '0 0 0',
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '20px 20px 0 0',
    padding: '20px 20px 32px',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  modalClose: {
    width: 30, height: 30,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 11,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.18s, box-shadow 0.18s',
    fontFamily: 'inherit',
  },
  saveBtn: {
    marginTop: 14,
    width: '100%',
    padding: '12px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 4px 14px rgba(30,144,255,0.3)',
  },
}