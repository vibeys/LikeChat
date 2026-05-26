import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { updateProfile, uploadProfilePhoto } from '../../services/userService'
import { fetchAccountStats, loadBlockedProfiles, unblockUser } from '../../services/settingsService'
import { formatDate, getAvatarColor, getInitials } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  Camera,
  PencilSimple,
  User,
  At,
  FileText,
  EnvelopeSimple,
  ShieldCheck,
  X,
  Check,
  GearSix,
  CaretRight,
  CalendarBlank,
  Prohibit,
  ChatCircleText,
  UsersThree,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

const MODAL = {
  NAME: 'name',
  BIO: 'bio',
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [editModal, setEditModal] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)

  const [blockedOpen, setBlockedOpen] = useState(false)
  const [blockedLoading, setBlockedLoading] = useState(false)
  const [blockedProfiles, setBlockedProfiles] = useState([])
  const [unblocking, setUnblocking] = useState(null)

  const [statsOpen, setStatsOpen] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [stats, setStats] = useState(null)

  const avatarColor = getAvatarColor(user?.displayName || user?.username || '')

  useEffect(() => {
    if (!blockedOpen) return
    if (!user?.blockedUsers?.length) {
      setBlockedProfiles([])
      return
    }
    if (blockedProfiles.length) return

    let cancelled = false
    ;(async () => {
      setBlockedLoading(true)
      try {
        const profiles = await loadBlockedProfiles(user.uid)
        if (!cancelled) setBlockedProfiles(profiles)
      } catch (err) {
        console.warn(err)
        if (!cancelled) toast.error('Failed to load blocked users')
      } finally {
        if (!cancelled) setBlockedLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [blockedOpen, user?.uid, user?.blockedUsers?.length, blockedProfiles.length])

  useEffect(() => {
    if (!statsOpen || stats) return

    let cancelled = false
    ;(async () => {
      setStatsLoading(true)
      try {
        const data = await fetchAccountStats(user.uid)
        if (!cancelled) {
          setStats({
            ...data,
            blockedCount: user?.blockedUsers?.length ?? 0,
            joinedAt: user?.createdAt ?? null,
          })
        }
      } catch (err) {
        console.warn(err)
        if (!cancelled) {
          setStats({
            messagesSent: 0,
            friendsCount: 0,
            blockedCount: user?.blockedUsers?.length ?? 0,
            joinedAt: user?.createdAt ?? null,
          })
        }
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [statsOpen, stats, user?.uid, user?.blockedUsers?.length, user?.createdAt])

  function openEdit(field) {
    setEditModal(field)
    setEditValue(field === MODAL.NAME ? (user?.displayName || '') : (user?.bio || ''))
  }

  async function saveEdit() {
    if (!user?.uid) return

    const trimmed = editValue.trim()
    if (editModal === MODAL.NAME && !trimmed) {
      return toast.error('Display name cannot be empty')
    }

    setSaving(true)
    try {
      await updateProfile(user.uid, editModal === MODAL.NAME ? { displayName: trimmed } : { bio: trimmed })
      await refreshUser()
      setEditModal(null)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      e.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      e.target.value = ''
      return
    }

    setPhotoLoading(true)
    try {
      await uploadProfilePhoto(user.uid, file)
      await refreshUser()
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err.message || 'Failed to update photo')
    } finally {
      setPhotoLoading(false)
      e.target.value = ''
    }
  }

  async function handleUnblock(theirUid) {
    setUnblocking(theirUid)
    try {
      await unblockUser(user.uid, theirUid)
      setBlockedProfiles(prev => prev.filter(p => p.uid !== theirUid))
      await refreshUser()
      toast.success('User unblocked')
    } catch (err) {
      toast.error(err.message || 'Failed to unblock')
    } finally {
      setUnblocking(null)
    }
  }

  const joinedLabel = user?.createdAt ? formatDate(user.createdAt) : '—'

  if (!user) return null

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.headerTitle}>Profile</h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={S.headerAction}
          onClick={() => navigate('/app/settings')}
          title="Settings"
        >
          <GearSix size={18} weight="bold" />
        </motion.button>
      </div>

      <div style={S.body}>
        <div style={S.heroCard}>
          <div style={S.avatarWrap}>
            <motion.button
              type="button"
              onClick={() => fileRef.current?.click()}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              style={S.avatarButton}
              disabled={photoLoading}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Profile'} style={S.avatar} />
              ) : (
                <div
                  style={{
                    ...S.avatar,
                    background: `linear-gradient(135deg, ${avatarColor.bg}, rgba(255,255,255,0.08))`,
                    color: avatarColor.text,
                  }}
                >
                  {getInitials(user.displayName || user.username || '?')}
                </div>
              )}

              <div style={S.avatarOverlay}>
                {photoLoading ? <Spinner size={18} /> : <Camera size={18} weight="fill" />}
              </div>
            </motion.button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
          </div>

          <div style={S.nameBlock}>
            <h3 style={S.name}>{user.displayName || 'Your name'}</h3>
            {user.username ? <p style={S.username}>@{user.username}</p> : null}
            {user.bio ? <p style={S.bio}>{user.bio}</p> : null}
          </div>

          <div style={S.miniGrid}>
            <MiniStat label="Joined" value={joinedLabel} icon={CalendarBlank} />
            <MiniStat label="Email" value={user.email ? 'Connected' : '—'} icon={EnvelopeSimple} />
            <MiniStat label="Verified" value={user.emailVerified ? 'Yes' : 'No'} icon={ShieldCheck} />
          </div>
        </div>

        <SectionLabel label="Profile" />
        <div style={S.card}>
          <Row
            Icon={User}
            label="Display Name"
            value={user.displayName || '—'}
            onClick={() => openEdit(MODAL.NAME)}
            action={<PencilSimple size={15} />}
          />
          <Row
            Icon={FileText}
            label="Bio"
            value={user.bio || 'Add a bio'}
            dim={!user.bio}
            onClick={() => openEdit(MODAL.BIO)}
            action={<PencilSimple size={15} />}
          />
          <Row
            Icon={At}
            label="Username"
            value={user.username ? `@${user.username}` : '—'}
            last
          />
        </div>

        <SectionLabel label="Account" />
        <div style={S.card}>
          <Row Icon={EnvelopeSimple} label="Email" value={user.email || '—'} />
          <Row
            Icon={ShieldCheck}
            label="Email verified"
            value={user.emailVerified ? 'Verified' : 'Not verified'}
            valueColor={user.emailVerified ? 'var(--success)' : 'var(--warning)'}
            last
          />
        </div>

        <SectionLabel label="Data" />
        <div style={S.card}>
          <Row
            Icon={ChatCircleText}
            label="Account Stats"
            value="Messages, friends and more"
            onClick={() => setStatsOpen(true)}
            action={<CaretRight size={15} />}
          />
          <Row
            Icon={Prohibit}
            label="Blocked Users"
            value={`${user.blockedUsers?.length ?? 0} blocked`}
            onClick={() => setBlockedOpen(true)}
            action={<CaretRight size={15} />}
            last
          />
        </div>

        <SectionLabel label="Actions" />
        <div style={S.card}>
          <Row
            Icon={GearSix}
            label="Settings"
            value="Password, privacy, notifications"
            onClick={() => navigate('/app/settings')}
            action={<CaretRight size={15} />}
            last
          />
        </div>
      </div>

      <AnimatePresence>
        {editModal && (
          <Sheet
            title={editModal === MODAL.NAME ? 'Edit Display Name' : 'Edit Bio'}
            onClose={() => setEditModal(null)}
          >
            {editModal === MODAL.NAME ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                maxLength={50}
                placeholder="Your display name"
                style={S.input}
              />
            ) : (
              <>
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  maxLength={160}
                  rows={5}
                  placeholder="Write something about yourself"
                  style={{ ...S.input, resize: 'none', minHeight: 120, lineHeight: 1.5 }}
                />
                <p style={S.counter}>{editValue.length}/160</p>
              </>
            )}

            <SaveButton onClick={saveEdit} saving={saving} label="Save changes" />
          </Sheet>
        )}

        {blockedOpen && (
          <Sheet title="Blocked Users" onClose={() => setBlockedOpen(false)} scroll>
            {blockedLoading ? (
              <div style={S.emptyState}>
                <Spinner size={22} />
                <p style={S.emptyTitle}>Loading blocked users...</p>
              </div>
            ) : blockedProfiles.length === 0 ? (
              <div style={S.emptyState}>
                <Prohibit size={36} weight="duotone" />
                <p style={S.emptyTitle}>No blocked users</p>
                <p style={S.emptyText}>Blocked accounts will appear here.</p>
              </div>
            ) : (
              <div style={S.list}>
                {blockedProfiles.map((bp, index) => (
                  <div
                    key={bp.uid}
                    style={{
                      ...S.blockRow,
                      borderBottom: index < blockedProfiles.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={S.blockAvatar}>
                      {bp.photoURL ? (
                        <img src={bp.photoURL} alt={bp.displayName || 'Blocked user'} style={S.blockAvatarImg} />
                      ) : (
                        <span>{getInitials(bp.displayName || bp.username || '?')}</span>
                      )}
                    </div>

                    <div style={S.blockInfo}>
                      <p style={S.blockName}>{bp.displayName || 'Unknown'}</p>
                      {bp.username ? <p style={S.blockUser}>@{bp.username}</p> : null}
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleUnblock(bp.uid)}
                      disabled={unblocking === bp.uid}
                      style={S.unblockBtn}
                    >
                      {unblocking === bp.uid ? 'Unblocking…' : 'Unblock'}
                    </motion.button>
                  </div>
                ))}
              </div>
            )}
          </Sheet>
        )}

        {statsOpen && (
          <Sheet title="Account Stats" onClose={() => setStatsOpen(false)} scroll>
            {statsLoading ? (
              <div style={S.emptyState}>
                <Spinner size={22} />
                <p style={S.emptyTitle}>Loading stats...</p>
              </div>
            ) : (
              <div style={S.statsGrid}>
                <StatCard icon={ChatCircleText} label="Messages sent" value={stats?.messagesSent ?? 0} />
                <StatCard icon={UsersThree} label="Friends" value={stats?.friendsCount ?? 0} />
                <StatCard icon={Prohibit} label="Blocked" value={stats?.blockedCount ?? 0} />
                <StatCard
                  icon={CalendarBlank}
                  label="Member since"
                  value={
                    stats?.joinedAt
                      ? new Date(stats.joinedAt?.toDate?.() ?? stats.joinedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'
                  }
                />
              </div>
            )}
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  )
}

function Sheet({ title, onClose, children, scroll = false }) {
  return (
    <motion.div
      style={S.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        style={{ ...S.sheet, ...(scroll ? { maxHeight: '88vh', overflowY: 'auto' } : {}) }}
        initial={{ y: 36, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 28, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={S.sheetHeader}>
          <span style={S.sheetTitle}>{title}</span>
          <motion.button
            style={S.sheetClose}
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
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
          ...S.rowIcon,
          background: iconBg || 'var(--primary-light)',
          color: iconColor || 'var(--primary)',
        }}
      >
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...S.rowLabel, color: labelColor || 'var(--text-primary)' }}>{label}</p>
        {value ? (
          <p
            style={{
              ...S.rowValue,
              color: valueColor || (dim ? 'var(--text-tertiary)' : 'var(--text-secondary)'),
            }}
          >
            {value}
          </p>
        ) : null}
      </div>

      {action ? <div style={S.rowAction}>{action}</div> : null}
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
  return <p style={S.sectionLabel}>{label}</p>
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div style={S.statCard}>
      <div style={S.statIcon}>
        <Icon size={18} />
      </div>
      <div>
        <p style={S.statValue}>{value}</p>
        <p style={S.statLabel}>{label}</p>
      </div>
    </div>
  )
}

function SaveButton({ onClick, saving, label = 'Save' }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={saving}
      whileHover={!saving ? { scale: 1.02, y: -1 } : {}}
      whileTap={!saving ? { scale: 0.97 } : {}}
      style={S.saveButton}
    >
      {saving ? <Spinner size={14} /> : <Check size={16} weight="bold" />}
      {saving ? 'Saving…' : label}
    </motion.button>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 16px 24px',
  },
  heroCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  avatarWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarButton: {
    position: 'relative',
    width: 104,
    height: 104,
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    background: 'transparent',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
  },
  avatarOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.35)',
    color: '#fff',
    opacity: 0,
    transition: 'opacity 0.15s ease',
  },
  nameBlock: {
    textAlign: 'center',
    marginBottom: 16,
  },
  name: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  username: {
    margin: '4px 0 0',
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  bio: {
    margin: '10px auto 0',
    maxWidth: 520,
    fontSize: 13,
    lineHeight: 1.55,
    color: 'var(--text-secondary)',
  },
  miniGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
  },
  miniStat: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: '12px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    minWidth: 0,
  },
  miniStatIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    flexShrink: 0,
  },
  miniStatLabel: {
    margin: 0,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-tertiary)',
    fontWeight: 700,
  },
  miniStatValue: {
    margin: '2px 0 0',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sectionLabel: {
    margin: '18px 0 8px 4px',
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-tertiary)',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
  },
  rowValue: {
    margin: '2px 0 0',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowAction: {
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.58)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: 'min(460px, calc(100vw - 32px))',
    background: 'var(--bg-primary)',
    borderRadius: 18,
    padding: '20px 22px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  counter: {
    margin: '8px 2px 0',
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textAlign: 'right',
  },
  saveButton: {
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
    boxShadow: '0 4px 14px rgba(30,144,255,0.25)',
    opacity: 1,
  },
  emptyState: {
    padding: '32px 0',
    textAlign: 'center',
    color: 'var(--text-tertiary)',
  },
  emptyTitle: {
    margin: '10px 0 4px',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  emptyText: {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  blockRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
  },
  blockAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 800,
  },
  blockAvatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  blockInfo: {
    flex: 1,
    minWidth: 0,
  },
  blockName: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  blockUser: {
    margin: '1px 0 0',
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  unblockBtn: {
    padding: '7px 13px',
    borderRadius: 9,
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    opacity: 1,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  statCard: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    flexShrink: 0,
  },
  statValue: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  statLabel: {
    margin: '2px 0 0',
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontWeight: 600,
  },
}