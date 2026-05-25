// src/pages/app/SettingsPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { logout, deleteAccount } from '../../services/authService'
import {
  changePassword,
  savePrivacySettings,
  saveNotificationPrefs,
  getInitialTheme,
  toggleTheme as toggleThemeService,
} from '../../services/settingsService'
import {
  Lock, Sun, Moon, Globe, BellSimple,
  CaretRight, CaretLeft, X, Check, Users, SignOut, Trash, Warning,
  Eye, EyeSlash, CheckCircle, XCircle, UserCircle,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

const M = { PASSWORD: 'password', PRIVACY: 'privacy', NOTIFICATIONS: 'notifications' }

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [darkMode, setDarkMode] = useState(getInitialTheme)

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwVis, setPwVis] = useState({ current: false, next: false, confirm: false })

  const [privacy, setPrivacy] = useState({
    profileVisible: 'everyone', showLastSeen: true, showOnlineStatus: true,
    allowFriendReqs: true, readReceipts: true,
  })

  const [notifs, setNotifs] = useState({
    messages: true, mentions: true, friendReqs: true, appUpdates: false, sound: true,
  })

  useEffect(() => {
    if (user?.privacy) setPrivacy(p => ({ ...p, ...user.privacy }))
    if (user?.notifications) setNotifs(n => ({ ...n, ...user.notifications }))
  }, [user])

  function handleToggleTheme() {
    const next = toggleThemeService(darkMode)
    setDarkMode(next)
  }

  async function handlePasswordChange() {
    if (!pw.current) return toast.error('Enter your current password')
    if (pw.next.length < 8) return toast.error('New password must be at least 8 characters')
    if (pw.next !== pw.confirm) return toast.error('Passwords do not match')
    setSaving(true)
    try {
      await changePassword(pw.current, pw.next)
      toast.success('Password changed!')
      setPw({ current: '', next: '', confirm: '' })
      setModal(null)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect')
      } else {
        toast.error(err.message || 'Failed to change password')
      }
    } finally { setSaving(false) }
  }

  async function handleSavePrivacy() {
    setSaving(true)
    try {
      await savePrivacySettings(user.uid, privacy)
      await refreshUser()
      toast.success('Privacy settings saved!')
      setModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleSaveNotifs() {
    setSaving(true)
    try {
      await saveNotificationPrefs(user.uid, notifs)
      await refreshUser()
      toast.success('Notification preferences saved!')
      setModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  function closeModal() { setModal(null); setDeleteModal(false) }

  async function handleLogout() {
    try { await logout(); navigate('/login') }
    catch { toast.error('Failed to logout') }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAccount()
      navigate('/login')
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete account')
    } finally { setSaving(false) }
  }

  const privacyLabel = { everyone: 'Everyone', friends: 'Friends only', nobody: 'Nobody' }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <motion.button onClick={() => navigate('/app/profile')}
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
          style={S.backBtn} title="Back">
          <CaretLeft size={18} weight="bold" />
        </motion.button>
        <h2 style={S.headerTitle}>Settings</h2>
      </div>

      <div style={S.content}>
        <SectionLabel label="Preferences" />
        <div style={S.card}>
          <Row Icon={darkMode ? Moon : Sun} label="Dark Mode" value={darkMode ? 'On' : 'Off'}
            onClick={handleToggleTheme} action={<Toggle on={darkMode} />} />
          <Row Icon={BellSimple} label="Notifications"
            value={notifs.messages && notifs.mentions ? 'All alerts on' : 'Some alerts off'}
            onClick={() => setModal(M.NOTIFICATIONS)} action={<CaretRight size={15} />} />
          <Row Icon={Globe} label="Privacy" value={`Profile: ${privacyLabel[privacy.profileVisible]}`}
            onClick={() => setModal(M.PRIVACY)} action={<CaretRight size={15} />} last />
        </div>

        <SectionLabel label="Security" />
        <div style={S.card}>
          <Row Icon={Lock} label="Change Password" value="Update your password"
            onClick={() => { setPw({ current: '', next: '', confirm: '' }); setModal(M.PASSWORD) }}
            action={<CaretRight size={15} />} last />
        </div>

        <SectionLabel label="Account" />
        <div style={S.card}>
          <Row Icon={SignOut} label="Sign Out" onClick={handleLogout} />
          <Row Icon={Trash} label="Delete Account" labelColor="var(--danger)"
            iconColor="var(--danger)" iconBg="rgba(229,57,53,0.1)"
            onClick={() => setDeleteModal(true)} last />
        </div>
      </div>

      <AnimatePresence>
        {modal === M.PASSWORD && (
          <Sheet title="Change Password" onClose={closeModal}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PwField label="Current password" field="current" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} autoFocus />
              <PwField label="New password" field="next" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
              <PwField label="Confirm new" field="confirm" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
            </div>
            {pw.next && <PwStrength password={pw.next} />}
            {pw.confirm && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11,
                color: pw.next === pw.confirm ? 'var(--success)' : 'var(--danger)' }}>
                {pw.next === pw.confirm
                  ? <><CheckCircle size={12} weight="fill" /> Passwords match</>
                  : <><XCircle size={12} weight="fill" /> Passwords do not match</>}
              </div>
            )}
            <SaveBtn label="Change Password" onClick={handlePasswordChange} saving={saving} />
          </Sheet>
        )}

        {modal === M.PRIVACY && (
          <Sheet title="Privacy" onClose={closeModal} scroll>
            <FieldLabel>Who can see your profile</FieldLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { v: 'everyone', Icon: Globe, label: 'Everyone' },
                { v: 'friends', Icon: Users, label: 'Friends' },
                { v: 'nobody', Icon: UserCircle, label: 'Nobody' },
              ].map(({ v, Icon, label }) => (
                <VisChip key={v} v={v} active={privacy.profileVisible} Icon={Icon} label={label}
                  onSelect={val => setPrivacy(p => ({ ...p, profileVisible: val }))} />
              ))}
            </div>
            <div style={S.toggleList}>
              <ToggleRow label="Last Seen" sub="Show when you were last active"
                value={privacy.showLastSeen} onChange={v => setPrivacy(p => ({ ...p, showLastSeen: v }))} />
              <ToggleRow label="Online Status" sub="Show when you're currently active"
                value={privacy.showOnlineStatus} onChange={v => setPrivacy(p => ({ ...p, showOnlineStatus: v }))} />
              <ToggleRow label="Friend Requests" sub="Allow others to send you friend requests"
                value={privacy.allowFriendReqs} onChange={v => setPrivacy(p => ({ ...p, allowFriendReqs: v }))} />
              <ToggleRow label="Read Receipts" sub="Let people see when you've read messages"
                value={privacy.readReceipts} onChange={v => setPrivacy(p => ({ ...p, readReceipts: v }))} last />
            </div>
            <SaveBtn label="Save Privacy Settings" onClick={handleSavePrivacy} saving={saving} />
          </Sheet>
        )}

        {modal === M.NOTIFICATIONS && (
          <Sheet title="Notifications" onClose={closeModal} scroll>
            <div style={S.toggleList}>
              <ToggleRow label="Messages" sub="New messages from friends"
                value={notifs.messages} onChange={v => setNotifs(n => ({ ...n, messages: v }))} />
              <ToggleRow label="Mentions" sub="When someone @mentions you"
                value={notifs.mentions} onChange={v => setNotifs(n => ({ ...n, mentions: v }))} />
              <ToggleRow label="Friend Requests" sub="New connection requests"
                value={notifs.friendReqs} onChange={v => setNotifs(n => ({ ...n, friendReqs: v }))} />
              <ToggleRow label="App Updates" sub="New features & announcements"
                value={notifs.appUpdates} onChange={v => setNotifs(n => ({ ...n, appUpdates: v }))} />
              <ToggleRow label="Sounds" sub="Play sounds for notifications"
                value={notifs.sound} onChange={v => setNotifs(n => ({ ...n, sound: v }))} last />
            </div>
            <SaveBtn label="Save Preferences" onClick={handleSaveNotifs} saving={saving} />
          </Sheet>
        )}
        {deleteModal && (
          <motion.div style={S.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal}>
            <motion.div style={{ width: 'min(440px, calc(100vw - 32px))', background: 'var(--bg-primary)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
              initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', padding: '8px 0 18px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(229,57,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--danger)' }}>
                  <Warning size={28} weight="fill" />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>Delete Account</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This will permanently delete your account, messages, and all data. This cannot be undone.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button onClick={closeModal} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</motion.button>
                <motion.button onClick={handleDelete} disabled={saving}
                  whileHover={!saving ? { scale: 1.02 } : {}} whileTap={!saving ? { scale: 0.97 } : {}}
                  style={{ flex: 1, padding: 11, borderRadius: 12, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
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

function Sheet({ title, onClose, children, scroll }) {
  return (
    <motion.div style={S.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div style={{ ...S.modal, ...(scroll ? { maxHeight: '88vh', overflowY: 'auto' } : {}) }}
        initial={{ y: 44, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 32, opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>{title}</span>
          <motion.button style={S.modalClose} onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <X size={15} />
          </motion.button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function Row({ Icon, label, value, dim, valueColor, labelColor, iconColor, iconBg, onClick, action, last }) {
  return (
    <motion.button onClick={onClick}
      whileHover={onClick ? { x: 2, backgroundColor: 'var(--bg-secondary)' } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        border: 'none', textAlign: 'left', background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: iconBg || 'var(--primary-light)', color: iconColor || 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: labelColor || 'var(--text-primary)' }}>{label}</p>
        {value && <p style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: valueColor || (dim ? 'var(--text-tertiary)' : 'var(--text-secondary)') }}>{value}</p>}
      </div>
      {action && <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{action}</div>}
    </motion.button>
  )
}

function Toggle({ on }) {
  return (
    <div style={{ width: 40, height: 22, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--primary)' : '#2c2c2c',
      position: 'relative', transition: 'background 0.2s' }}>
      <motion.div animate={{ x: on ? 19 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </div>
  )
}

function ToggleRow({ label, sub, value, onChange, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14,
      marginBottom: last ? 0 : 14, borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>{sub}</p>
      </div>
      <motion.button onClick={() => onChange(!value)} whileTap={{ scale: 0.9 }}
        style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? 'var(--primary)' : '#2c2c2c', position: 'relative', transition: 'background 0.2s' }}>
        <motion.div animate={{ x: value ? 19 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
      </motion.button>
    </div>
  )
}

function VisChip({ v, active, Icon, label, onSelect }) {
  const on = active === v
  return (
    <motion.button whileTap={{ scale: 0.95 }} onClick={() => onSelect(v)}
      style={{ flex: 1, padding: '10px 6px', borderRadius: 10, border: '1.5px solid',
        borderColor: on ? 'var(--primary)' : 'var(--border)',
        background: on ? 'var(--primary-light)' : 'var(--bg-secondary)',
        color: on ? 'var(--primary)' : 'var(--text-secondary)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 700, transition: 'all 0.15s' }}>
      <Icon size={18} /> {label}
    </motion.button>
  )
}

function PwField({ label, field, pw, setPw, pwVis, setPwVis, autoFocus }) {
  return (
    <div>
      <p style={S.fieldLabel}>{label}</p>
      <div style={{ position: 'relative' }}>
        <input type={pwVis[field] ? 'text' : 'password'} value={pw[field]}
          onChange={e => setPw(f => ({ ...f, [field]: e.target.value }))} placeholder="••••••••" autoFocus={autoFocus}
          style={{ ...S.input, paddingRight: 40 }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
        <button type="button" onClick={() => setPwVis(s => ({ ...s, [field]: !s[field] }))}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}>
          {pwVis[field] ? <EyeSlash size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

function PwStrength({ password }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)]
  const score = checks.filter(Boolean).length
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e']
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : 'var(--border)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: colors[score] || 'var(--text-tertiary)' }}>{score > 0 ? labels[score] : ''}</p>
    </div>
  )
}

function SectionLabel({ label }) {
  return <p style={{ margin: '20px 0 6px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>{label}</p>
}

function FieldLabel({ children }) {
  return <p style={S.fieldLabel}>{children}</p>
}

function SaveBtn({ onClick, saving, label = 'Save' }) {
  return (
    <motion.button onClick={onClick} disabled={saving}
      whileHover={!saving ? { scale: 1.02, y: -1 } : {}} whileTap={!saving ? { scale: 0.97 } : {}}
      style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 12, border: 'none',
        background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 4px 14px rgba(30,144,255,0.3)', opacity: saving ? 0.6 : 1 }}>
      {saving ? <Spinner size={14} color="#fff" /> : <Check size={16} weight="bold" />}
      {saving ? 'Saving...' : label}
    </motion.button>
  )
}

function Spinner({ size = 18, color = 'var(--primary)' }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.65s linear infinite', flexShrink: 0 }} />
  )
}

const S = {
  page: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', flexShrink: 0 },
  backBtn: { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  content: { flex: 1, overflowY: 'auto', padding: '0 16px 24px' },
  card: { borderRadius: 12, overflow: 'hidden', background: 'var(--bg-primary)', border: '1px solid var(--border)' },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: 'min(440px, calc(100vw - 32px))', background: 'var(--bg-primary)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '88vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' },
  modalClose: { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fieldLabel: { margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.18s', fontFamily: 'inherit' },
  toggleList: { display: 'flex', flexDirection: 'column' },
}
