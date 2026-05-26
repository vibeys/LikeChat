// src/pages/app/ProfilePage.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { updateProfile, uploadProfilePhoto } from '../../services/userService'
import { loadBlockedProfiles, unblockUser, fetchAccountStats } from '../../services/settingsService'
import { getInitials, getAvatarColor, formatDate } from '../../lib/utils'
import {
  Camera, PencilSimple, User, At, FileText, EnvelopeSimple, ShieldCheck,
  X, Check, GearSix, CaretRight, CalendarBlank, Prohibit, ChatCircleDots, Users,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

const M = { NAME: 'name', BIO: 'bio' }

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [openModal, setOpenModal] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [blockedProfiles, setBlockedProfiles] = useState([])
  const [blockedLoading, setBlockedLoading] = useState(false)
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [unblocking, setUnblocking] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  const fileRef = useRef(null)
  const ac = getAvatarColor(user?.displayName || '')

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')

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

  function openEdit(field) {
    setEditValue(field === M.NAME ? (user?.displayName || '') : (user?.bio || ''))
    setOpenModal(field)
  }

  async function handleSave() {
    const trimmed = editValue.trim()
    if (openModal === M.NAME && !trimmed) return toast.error('Name cannot be empty')

    setSaving(true)
    try {
      await updateProfile(user.uid, openModal === M.NAME ? { displayName: trimmed } : { bio: trimmed })
      await refreshUser()
      toast.success('Profile updated!')
      setOpenModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function closeModal() {
    setOpenModal(null)
    setBlockedOpen(false)
    setStatsOpen(false)
  }

  async function openBlocked() {
    if (!(user?.blockedUsers?.length)) {
      setBlockedProfiles([])
      setBlockedOpen(true)
      return
    }

    setBlockedOpen(true)
    setBlockedLoading(true)
    setBlockedProfiles([])

    try {
      const profiles = await loadBlockedProfiles(user.uid)
      setBlockedProfiles(profiles)
    } catch {
      toast.error('Failed to load blocked users')
    } finally {
      setBlockedLoading(false)
    }
  }

  async function handleUnblock(theirUid) {
    setUnblocking(theirUid)
    try {
      await unblockUser(user.uid, theirUid)
      await refreshUser()
      setBlockedProfiles(prev => prev.filter(p => p.uid !== theirUid))
      toast.success('User unblocked')
    } catch (err) {
      toast.error(err.message || 'Failed to unblock')
    } finally {
      setUnblocking(null)
    }
  }

  async function openStats() {
    setStatsOpen(true)
    setStatsLoading(true)
    setStats(null)
    try {
      const data = await fetchAccountStats(user.uid)
      setStats({
        ...data,
        joinedAt: user?.createdAt,
        blockedCount: user?.blockedUsers?.length ?? 0,
      })
    } catch {
      setStats({
        messagesSent: 0,
        friendsCount: 0,
        joinedAt: user?.createdAt,
        blockedCount: user?.blockedUsers?.length ?? 0,
      })
    } finally {
      setStatsLoading(false)
    }
  }

  const joinedText = user?.createdAt
    ? formatDate(new Date(user.createdAt?.toDate?.() ?? user.createdAt))
    : '—'

  return (
    <div style={S.page}>
      <div style={S.hero}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
            style={{ cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'Profile photo'} style={S.avatar} />
            ) : (
              <div
                style={{
                  ...S.avatar,
                  background: `linear-gradient(135deg, ${ac.bg}, rgba(255,255,255,0.08))`,
                  color: ac.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                {getInitials(user?.displayName || '?')}
              </div>
            )}
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => fileRef.current?.click()}
            disabled={photoLoading}
            style={S.cameraBtn}
            title="Change photo"
          >
            {photoLoading ? <Spinner size={14} color="#fff" /> : <Camera size={15} weight="fill" />}
          </motion.button>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
        </div>

        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <h2 style={S.name}>{user?.displayName || 'Your Name'}</h2>
          {user?.username && <p style={S.username}>@{user.username}</p>}
          {user?.bio && <p style={S.bio}>{user.bio}</p>}
        </div>

        <div style={S.heroStats}>
          <MiniStat label="Joined" value={joinedText} icon={CalendarBlank} />
          <MiniStat label="Email" value={user?.email ? 'Connected' : '—'} icon={EnvelopeSimple} />
          <MiniStat label="Verified" value={user?.emailVerified ? 'Yes' : 'No'} icon={ShieldCheck} />
        </div>
      </div>

      <div style={S.content}>
        <SectionLabel label="Profile" />
        <div style={S.card}>
          <Row
            Icon={User}
            label="Display Name"
            value={user?.displayName || '—'}
            onClick={() => openEdit(M.NAME)}
            action={<PencilSimple size={15} />}
          />
          <Row
            Icon={FileText}
            label="Bio"
            value={user?.bio || 'Add a bio'}
            dim={!user?.bio}
            onClick={() => openEdit(M.BIO)}
            action={<PencilSimple size={15} />}
          />
          <Row
            Icon={At}
            label="Username"
            value={user?.username ? `@${user.username}` : '—'}
            last
          />
        </div>

        <SectionLabel label="Account" />
        <div style={S.card}>
          <Row Icon={EnvelopeSimple} label="Email" value={user?.email || '—'} />
          <Row
            Icon={ShieldCheck}
            label="Email Verified"
            value={user?.emailVerified ? 'Verified' : 'Not verified'}
            valueColor={user?.emailVerified ? 'var(--success)' : 'var(--warning)'}
            last
          />
        </div>

        <SectionLabel label="Data" />
        <div style={S.card}>
          <Row
            Icon={CalendarBlank}
            label="Account Stats"
            value="Messages, friends & more"
            onClick={openStats}
            action={<CaretRight size={15} />}
          />
          <Row
            Icon={Prohibit}
            label="Blocked Users"
            value={`${user?.blockedUsers?.length ?? 0} blocked`}
            onClick={openBlocked}
            action={<CaretRight size={15} />}
            last
          />
        </div>

        <SectionLabel label="Actions" />
        <div style={S.card}>
          <Row
            Icon={GearSix}
            label="Settings"
            value="Password, privacy, notifications, and more"
            onClick={() => navigate('/app/settings')}
            action={<CaretRight size={15} />}
            last
          />
        </div>
      </div>

      <AnimatePresence>
        {(openModal === M.NAME || openModal === M.BIO) && (
          <Sheet title={openModal === M.NAME ? 'Edit Display Name' : 'Edit Bio'} onClose={closeModal}>
            {openModal === M.BIO ? (
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="Write something about yourself…"
                maxLength={160}
                rows={4}
                autoFocus
                style={{ ...S.input, resize: 'none', lineHeight: 1.5 }}
                onFocus={e => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
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
                onFocus={e => { e.target.style.borderColor = 'var(--primary)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            )}

            {openModal === M.BIO && (
              <p style={S.counter}>{editValue.length}/160</p>
            )}

            <SaveBtn onClick={handleSave} saving={saving} />
          </Sheet>
        )}

        {blockedOpen && (
          <Sheet title="Blocked Users" onClose={() => setBlockedOpen(false)} scroll>
            {blockedLoading && blockedProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Spinner size={22} />
                <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-tertiary)' }}>Loading...</p>
              </div>
            ) : blockedProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Prohibit size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No blocked users</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Users you block will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {blockedProfiles.map((bp, i) => (
                  <div key={bp.uid} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderBottom: i < blockedProfiles.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-secondary)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                      {bp.photoURL ? <img src={bp.photoURL} alt={bp.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: 'var(--text-primary)' }}>{(bp.displayName || '?')[0]}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{bp.displayName}</p>
                      {bp.username && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>@{bp.username}</p>}
                    </div>
                    <motion.button onClick={() => handleUnblock(bp.uid)} disabled={unblocking === bp.uid}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: unblocking === bp.uid ? 0.5 : 1 }}>
                      {unblocking === bp.uid ? 'Unblocking...' : 'Unblock'}
                    </motion.button>
                  </div>
                ))}
              </div>
            )}
          </Sheet>
        )}

        {statsOpen && (
          <Sheet title="Account Stats" onClose={() => setStatsOpen(false)} scroll>
            {statsLoading && !stats ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Spinner size={22} />
                <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-tertiary)' }}>Loading...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <StatCard Icon={ChatCircleDots} label="Messages Sent" value={stats?.messagesSent?.toLocaleString() ?? '0'} />
                  <StatCard Icon={Users} label="Friends" value={stats?.friendsCount?.toLocaleString() ?? '0'} />
                  <StatCard Icon={Prohibit} label="Blocked" value={stats?.blockedCount?.toString() ?? '0'} />
                  {stats?.joinedAt && (
                    <StatCard Icon={CalendarBlank} label="Member Since"
                      value={new Date(stats.joinedAt?.toDate?.() ?? stats.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} />
                  )}
                </div>
              </div>
            )}
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  )
}

function Sheet({ title, onClose, children, scroll }) {
  return (
    <motion.div
      style={S.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        style={{ ...S.modal, ...(scroll ? { maxHeight: '88vh', overflowY: 'auto' } : {}) }}
        initial={{ y: 44, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 32, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>{title}</span>
          <motion.button
            style={S.modalClose}
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
          >
            <X size={15} />
          </motion.button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function Row({ Icon, label, value, dim, valueColor, labelColor, iconColor, iconBg, onClick, action, last }) {
  const Comp = onClick ? motion.button : 'div'

  return (
    <Comp
      onClick={onClick}
      whileHover={onClick ? { x: 2, backgroundColor: 'var(--bg-secondary)' } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        border: 'none',
        textAlign: 'left',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          flexShrink: 0,
          background: iconBg || 'var(--primary-light)',
          color: iconColor || 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: labelColor || 'var(--text-primary)' }}>
          {label}
        </p>
        {value && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: valueColor || (dim ? 'var(--text-tertiary)' : 'var(--text-secondary)'),
            }}
          >
            {value}
          </p>
        )}
      </div>

      {action && <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{action}</div>}
    </Comp>
  )
}

function MiniStat({ label, value, icon: Icon }) {
  return (
    <div style={S.miniStat}>
      <div style={S.miniStatIcon}>
        <Icon size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={S.miniStatLabel}>{label}</p>
        <p style={S.miniStatValue}>{value}</p>
      </div>
    </div>
  )
}

function SectionLabel({ label }) {
  return (
    <p style={S.sectionLabel}>{label}</p>
  )
}

function StatCard({ Icon, label, value }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: 'var(--primary-light)',
        color: 'var(--primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} weight="bold" />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</p>
      </div>
    </div>
  )
}

function SaveBtn({ onClick, saving, label = 'Save' }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={saving}
      whileHover={!saving ? { scale: 1.02, y: -1 } : {}}
      whileTap={!saving ? { scale: 0.97 } : {}}
      style={S.saveBtn}
    >
      {saving ? <Spinner size={14} color="#fff" /> : <Check size={16} weight="bold" />}
      {saving ? 'Saving…' : label}
    </motion.button>
  )
}

function Spinner({ size = 18, color = 'var(--primary)' }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.65s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

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
    padding: '28px 20px 18px',
    background: 'linear-gradient(160deg, #020202 0%, #0d0d0d 55%, #001428 100%)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    gap: 10,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2.5px solid rgba(30,144,255,0.35)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--primary)',
    border: '2.5px solid #0d0d0d',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(30,144,255,0.4)',
  },
  name: {
    margin: 0,
    fontSize: 21,
    fontWeight: 850,
    color: '#fff',
    letterSpacing: '-0.03em',
  },
  username: {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 600,
  },
  bio: {
    margin: '10px auto 0',
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    maxWidth: 280,
    lineHeight: 1.55,
    textAlign: 'center',
  },
  heroStats: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
    marginTop: 6,
  },
  miniStat: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: '10px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  miniStatIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: 'rgba(30,144,255,0.16)',
    color: 'rgba(255,255,255,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  miniStatLabel: {
    margin: 0,
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 700,
    lineHeight: 1,
  },
  miniStatValue: {
    margin: '3px 0 0',
    fontSize: 11,
    color: 'rgba(255,255,255,0.86)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 16px 32px',
  },
  card: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  },
  sectionLabel: {
    margin: '20px 0 6px 4px',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: 'var(--text-tertiary)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '20px 20px 22px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    transition: 'border-color 0.18s',
    fontFamily: 'inherit',
  },
  counter: {
    margin: '4px 0 0',
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textAlign: 'right',
  },
  saveBtn: {
    marginTop: 16,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxShadow: '0 4px 14px rgba(30,144,255,0.3)',
  },
}