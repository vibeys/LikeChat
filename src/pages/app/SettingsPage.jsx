import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { logout, deleteAccount } from '../../services/authService'
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  changePassword,
  savePrivacySettings,
  saveNotificationPrefs,
  loadBlockedProfiles,
  unblockUser,
  fetchAccountStats,
  getInitialTheme,
  getThemeEventName,
  toggleTheme as toggleThemeService,
} from '../../services/settingsService'
import { goOnline } from '../../lib/presence'
import { getInitials, getAvatarColor } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  At,
  Lock,
  Sun,
  Moon,
  BellSimple,
  CaretRight,
  CaretLeft,
  X,
  Check,
  Users,
  UserPlus,
  SignOut,
  Trash,
  Warning,
  Eye,
  EyeSlash,
  CheckCircle,
  XCircle,
  ShieldCheck,
  WifiHigh,
  ChatCircle,
  SpeakerHigh,
  Megaphone,
  Prohibit,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL = {
  PASSWORD:      'password',
  PRIVACY:       'privacy',
  NOTIFICATIONS: 'notifications',
  BLOCKED:       'blocked',
}

const SPRING_SHEET  = { type: 'spring', stiffness: 360, damping: 30 }
const SPRING_TOGGLE = { type: 'spring', stiffness: 500, damping: 28 }

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [modal,       setModal]       = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [darkMode,    setDarkMode]    = useState(() => getInitialTheme())

  const [pw,    setPw]    = useState({ current: '', next: '', confirm: '' })
  const [pwVis, setPwVis] = useState({ current: false, next: false, confirm: false })

  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY)
  const [notifs,  setNotifs]  = useState(DEFAULT_NOTIFICATIONS)

  const [blockedUsers,   setBlockedUsers]   = useState([])
  const [loadingBlocked, setLoadingBlocked] = useState(false)
  const [stats,          setStats]          = useState(null)

  // ── Sync user preferences into local state ────────────────────────────────
  useEffect(() => {
    if (!user) return
    const loaded = { ...DEFAULT_PRIVACY, ...(user.privacy || {}) }
    setPrivacy({
      ...loaded,
      allowFriendReqsVisibility: loaded.allowFriendReqsVisibility === 'all' ? 'friends' : loaded.allowFriendReqsVisibility,
      readReceiptsVisibility:    loaded.readReceiptsVisibility    === 'all' ? 'friends' : loaded.readReceiptsVisibility,
    })
    setNotifs({ ...DEFAULT_NOTIFICATIONS, ...(user.notifications || {}) })
  }, [user])

  // ── Keep dark-mode synced across tabs ─────────────────────────────────────
  useEffect(() => {
    const sync = () => setDarkMode(getInitialTheme())
    const ev   = getThemeEventName()
    window.addEventListener('storage', sync)
    window.addEventListener(ev, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(ev, sync)
    }
  }, [])

  // ── Load blocked users when modal opens ───────────────────────────────────
  useEffect(() => {
    if (modal !== MODAL.BLOCKED || !user?.uid) return
    setLoadingBlocked(true)
    loadBlockedProfiles(user.uid)
      .then(setBlockedUsers)
      .catch(() => toast.error('Could not load blocked users'))
      .finally(() => setLoadingBlocked(false))
  }, [modal, user?.uid])

  // ── Load account stats once ───────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    fetchAccountStats(user.uid)
      .then(setStats)
      .catch(() => {})
  }, [user?.uid])

  // ── Derived subtitle values ───────────────────────────────────────────────
  const notifsOnCount = useMemo(() => Object.values(notifs).filter(Boolean).length, [notifs])
  const notifsTotal   = Object.keys(notifs).length

  const notifsValue = useMemo(() => {
    if (notifsOnCount === notifsTotal) return 'All on'
    if (notifsOnCount === 0)           return 'All off'
    return `${notifsOnCount} / ${notifsTotal} on`
  }, [notifsOnCount, notifsTotal])

  const privacyValue = useMemo(() => {
    const online = privacy.onlineStatusVisibility === 'friends' ? 'Visible' : 'Hidden'
    const seen   = privacy.lastSeenVisibility      === 'friends' ? 'Last seen on' : 'Last seen off'
    return `${online} online · ${seen}`
  }, [privacy])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const closeModal = useCallback(() => {
    setModal(null)
    setDeleteModal(false)
  }, [])

  const openPasswordModal = useCallback(() => {
    setPw({ current: '', next: '', confirm: '' })
    setPwVis({ current: false, next: false, confirm: false })
    setModal(MODAL.PASSWORD)
  }, [])

  const handleToggleTheme = useCallback(() => {
    const next = toggleThemeService(darkMode)
    setDarkMode(next)
  }, [darkMode])

  const handlePasswordChange = useCallback(async () => {
    if (!pw.current)            return toast.error('Enter your current password')
    if (pw.next.length < 8)     return toast.error('New password must be at least 8 characters')
    if (pw.next !== pw.confirm)  return toast.error('Passwords do not match')
    setSaving(true)
    try {
      await changePassword(pw.current, pw.next)
      toast.success('Password changed!')
      setPw({ current: '', next: '', confirm: '' })
      setModal(null)
    } catch (err) {
      const code = err?.code || ''
      toast.error(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect'
          : err?.message || 'Failed to change password'
      )
    } finally { setSaving(false) }
  }, [pw])

  const handleSavePrivacy = useCallback(async () => {
    if (!user?.uid) return
    setSaving(true)
    try {
      await savePrivacySettings(user.uid, privacy)
      await refreshUser()
      goOnline(user.uid, privacy.onlineStatusVisibility === 'friends')
      toast.success('Privacy settings saved!')
      setModal(null)
    } catch (err) {
      toast.error(err?.message || 'Failed to save privacy settings')
    } finally { setSaving(false) }
  }, [user?.uid, privacy, refreshUser])

  const handleSaveNotifs = useCallback(async () => {
    if (!user?.uid) return
    setSaving(true)
    try {
      await saveNotificationPrefs(user.uid, notifs)
      await refreshUser()
      toast.success('Notification preferences saved!')
      setModal(null)
    } catch (err) {
      toast.error(err?.message || 'Failed to save notification settings')
    } finally { setSaving(false) }
  }, [user?.uid, notifs, refreshUser])

  const handleUnblock = useCallback(async (theirUid) => {
    if (!user?.uid) return
    try {
      await unblockUser(user.uid, theirUid)
      setBlockedUsers(prev => prev.filter(u => u.uid !== theirUid))
      toast.success('User unblocked')
    } catch { toast.error('Failed to unblock user') }
  }, [user?.uid])

  const handleLogout = useCallback(async () => {
    try { await logout(); navigate('/login') }
    catch (err) { toast.error(err?.message || 'Failed to log out') }
  }, [navigate])

  const handleDelete = useCallback(async () => {
    setSaving(true)
    try {
      await deleteAccount()
      navigate('/login')
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err?.message || 'Failed to delete account')
    } finally { setSaving(false) }
  }, [navigate])

  if (!user) return null

  const avatarColors = getAvatarColor(user.displayName || user.email || '')
  const initials     = getInitials(user.displayName || user.email || '?')
  const blockedCount = user.blockedUsers?.length ?? 0

  return (
    <div style={S.page}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <motion.button
          onClick={() => navigate(-1)}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.92 }}
          style={S.backBtn}
        >
          <CaretLeft size={17} weight="bold" />
        </motion.button>
        <h2 style={S.headerTitle}>Settings</h2>
      </div>

      <div style={S.content}>

        {/* ── Profile card ───────────────────────────────────────────────── */}
        <motion.button
          onClick={() => navigate('/app/profile')}
          whileHover={{ scale: 1.008 }}
          whileTap={{ scale: 0.995 }}
          style={S.profileCard}
        >
          <div style={S.profileCardAccent} />

          <div style={{ ...S.profileAvatar, background: avatarColors.bg }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={S.avatarImg} />
              : <span style={{ fontSize: 19, fontWeight: 900, color: avatarColors.text }}>{initials}</span>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <p style={S.profileName}>{user.displayName || 'Your Profile'}</p>
            <p style={S.profileSub}>
              {user.username ? `@${user.username}` : user.email}
              {stats ? ` · ${stats.friendsCount} friend${stats.friendsCount !== 1 ? 's' : ''}` : ''}
            </p>
          </div>

          <div style={S.profileChevron}>
            <CaretRight size={13} weight="bold" />
          </div>
        </motion.button>

        {/* ── Quick stats ────────────────────────────────────────────────── */}
        <div style={S.statsRow}>
          <StatPill color="#22c55e" icon={<Users size={12} weight="fill" />} label={stats ? `${stats.friendsCount} friends` : '—'} />
          <StatPill color="#3b82f6" icon={<ShieldCheck size={12} weight="fill" />} label={blockedCount === 0 ? 'No blocks' : `${blockedCount} blocked`} />
          <StatPill
            color={darkMode ? '#f59e0b' : '#8b5cf6'}
            icon={darkMode ? <Moon size={12} weight="fill" /> : <Sun size={12} weight="fill" />}
            label={darkMode ? 'Dark' : 'Light'}
          />
        </div>

        {/* ── PREFERENCES ────────────────────────────────────────────────── */}
        <SectionLabel label="Preferences" />
        <div style={S.card}>
          <SettingRow
            Icon={darkMode ? Moon : Sun}
            iconBg="rgba(245,158,11,0.14)" iconColor="#f59e0b"
            label="Dark mode"
            value={darkMode ? 'Dark theme active' : 'Light theme active'}
            onClick={handleToggleTheme}
            action={<Toggle on={darkMode} />}
          />
          <SettingRow
            Icon={BellSimple}
            iconBg="rgba(59,130,246,0.14)" iconColor="#3b82f6"
            label="Notifications"
            value={notifsValue}
            onClick={() => setModal(MODAL.NOTIFICATIONS)}
            action={<Chevron />}
          />
          <SettingRow
            Icon={ShieldCheck}
            iconBg="rgba(139,92,246,0.14)" iconColor="#8b5cf6"
            label="Privacy"
            value={privacyValue}
            onClick={() => setModal(MODAL.PRIVACY)}
            action={<Chevron />}
            last
          />
        </div>

        {/* ── SECURITY ───────────────────────────────────────────────────── */}
        <SectionLabel label="Security" />
        <div style={S.card}>
          <SettingRow
            Icon={Lock}
            iconBg="rgba(34,197,94,0.14)" iconColor="#22c55e"
            label="Change password"
            value="Update your account password"
            onClick={openPasswordModal}
            action={<Chevron />}
            last
          />
        </div>

        {/* ── ACCOUNT ────────────────────────────────────────────────────── */}
        <SectionLabel label="Account" />
        <div style={S.card}>
          <SettingRow
            Icon={Prohibit}
            iconBg="rgba(107,114,128,0.12)" iconColor="var(--text-secondary)"
            label="Blocked users"
            value={blockedCount > 0 ? `${blockedCount} blocked user${blockedCount !== 1 ? 's' : ''}` : 'No blocked users'}
            onClick={() => setModal(MODAL.BLOCKED)}
            action={<Chevron />}
          />
          <SettingRow
            Icon={SignOut}
            iconBg="rgba(107,114,128,0.12)" iconColor="var(--text-secondary)"
            label="Sign out"
            value="Come back soon"
            onClick={handleLogout}
          />
          <SettingRow
            Icon={Trash}
            iconBg="rgba(239,68,68,0.12)" iconColor="#ef4444"
            label="Delete account"
            labelColor="#ef4444"
            value="Remove all data permanently"
            onClick={() => setDeleteModal(true)}
            last
          />
        </div>

        <p style={S.versionTag}>LikeChat · v1.0</p>
      </div>

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      <AnimatePresence>

        {/* ── Password ──────────────────────────────────────────────────── */}
        {modal === MODAL.PASSWORD && (
          <Sheet title="Change Password" onClose={closeModal} accentColor="#22c55e">
            <ModalHero
              icon={<Lock size={20} weight="fill" />}
              iconBg="rgba(34,197,94,0.15)" iconColor="#22c55e"
              text="Use at least 8 characters with an uppercase letter, a number, and a symbol."
            />

            <div style={S.stack}>
              <PwField label="Current password" field="current" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} autoFocus />
              <PwField label="New password"     field="next"    pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
              <PwField label="Confirm password" field="confirm" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
            </div>

            {pw.next && <PwStrength password={pw.next} />}

            {pw.confirm && (
              <div style={{ ...S.matchRow, color: pw.next === pw.confirm ? '#22c55e' : '#ef4444' }}>
                {pw.next === pw.confirm
                  ? <><CheckCircle size={13} weight="fill" /><span>Passwords match</span></>
                  : <><XCircle    size={13} weight="fill" /><span>Passwords do not match</span></>
                }
              </div>
            )}

            <SaveBtn label="Change password" onClick={handlePasswordChange} saving={saving} accentColor="#22c55e" />
          </Sheet>
        )}

        {/* ── Privacy ───────────────────────────────────────────────────── */}
        {modal === MODAL.PRIVACY && (
          <Sheet title="Privacy" onClose={closeModal} scroll accentColor="#8b5cf6">
            <ModalHero
              icon={<ShieldCheck size={20} weight="fill" />}
              iconBg="rgba(139,92,246,0.15)" iconColor="#8b5cf6"
              text="Control who can see your profile and how your activity appears to others."
            />

            <div style={S.resetBar}>
              <p style={S.resetText}>Customize visibility across your account.</p>
              <button type="button" onClick={() => setPrivacy(DEFAULT_PRIVACY)} style={S.resetBtn}>Reset</button>
            </div>

            <div style={S.privacyList}>
              <PreferenceDropdown
                id="privacy-lastseen"
                icon={<Eye size={15} />} iconColor="#3b82f6"
                label="Last seen"
                value={privacy.lastSeenVisibility}
                options={[
                  { value: 'friends', label: 'Friends only', icon: Users,    desc: 'Friends can see when you were last online' },
                  { value: 'nobody',  label: 'No one',       icon: EyeSlash, desc: 'Last seen is hidden from everyone' },
                ]}
                onChange={val => setPrivacy(prev => ({ ...prev, lastSeenVisibility: val }))}
              />
              <PreferenceDropdown
                id="privacy-online"
                icon={<WifiHigh size={15} />} iconColor="#22c55e"
                label="Online status"
                value={privacy.onlineStatusVisibility}
                options={[
                  { value: 'friends', label: 'Friends only', icon: Users,    desc: 'Friends see when you are active' },
                  { value: 'nobody',  label: 'No one',       icon: EyeSlash, desc: 'Your online status is hidden' },
                ]}
                onChange={val => setPrivacy(prev => ({ ...prev, onlineStatusVisibility: val }))}
              />
              <PreferenceDropdown
                id="privacy-requests"
                icon={<UserPlus size={15} />} iconColor="#8b5cf6"
                label="Friend requests"
                value={privacy.allowFriendReqsVisibility}
                options={[
                  { value: 'friends', label: 'Friends only', icon: Users,   desc: 'Only friends can send requests' },
                  { value: 'nobody',  label: 'Disabled',     icon: XCircle, desc: 'No one can send friend requests' },
                ]}
                onChange={val => setPrivacy(prev => ({ ...prev, allowFriendReqsVisibility: val }))}
              />
              <PreferenceDropdown
                id="privacy-readreceipts"
                icon={<CheckCircle size={15} />} iconColor="#f59e0b"
                label="Read receipts"
                value={privacy.readReceiptsVisibility}
                options={[
                  { value: 'friends', label: 'Friends only', icon: Users,   desc: 'Friends see when you read messages' },
                  { value: 'nobody',  label: 'Off',          icon: XCircle, desc: 'Read receipts are disabled' },
                ]}
                onChange={val => setPrivacy(prev => ({ ...prev, readReceiptsVisibility: val }))}
              />
            </div>

            <SaveBtn label="Save privacy settings" onClick={handleSavePrivacy} saving={saving} accentColor="#8b5cf6" />
          </Sheet>
        )}

        {/* ── Notifications ─────────────────────────────────────────────── */}
        {modal === MODAL.NOTIFICATIONS && (
          <Sheet title="Notifications" onClose={closeModal} scroll accentColor="#3b82f6">
            <ModalHero
              icon={<BellSimple size={20} weight="fill" />}
              iconBg="rgba(59,130,246,0.15)" iconColor="#3b82f6"
              text="Choose which alerts you receive. Changes are saved to your account."
            />

            <div style={S.resetBar}>
              <p style={S.resetText}>Saved to your account and applied instantly.</p>
              <button type="button" onClick={() => setNotifs(DEFAULT_NOTIFICATIONS)} style={S.resetBtn}>Reset</button>
            </div>

            <div style={S.toggleList}>
              <ToggleRow
                icon={<ChatCircle size={15} />} iconColor="#3b82f6"
                label="Messages" sub="Alerts for new messages"
                value={notifs.messages}
                onChange={v => setNotifs(prev => ({ ...prev, messages: v }))}
              />
              <ToggleRow
                icon={<At size={15} />} iconColor="#f59e0b"
                label="Mentions" sub="When someone @mentions you"
                value={notifs.mentions}
                onChange={v => setNotifs(prev => ({ ...prev, mentions: v }))}
              />
              <ToggleRow
                icon={<UserPlus size={15} />} iconColor="#8b5cf6"
                label="Friend requests" sub="New connection requests"
                value={notifs.friendReqs}
                onChange={v => setNotifs(prev => ({ ...prev, friendReqs: v }))}
              />
              <ToggleRow
                icon={<Megaphone size={15} />} iconColor="#22c55e"
                label="App updates" sub="Announcements and new features"
                value={notifs.appUpdates}
                onChange={v => setNotifs(prev => ({ ...prev, appUpdates: v }))}
              />
              <ToggleRow
                icon={<SpeakerHigh size={15} />} iconColor="var(--primary)"
                label="Sounds" sub="Play notification sounds"
                value={notifs.sound}
                onChange={v => setNotifs(prev => ({ ...prev, sound: v }))}
                last
              />
            </div>

            <SaveBtn label="Save preferences" onClick={handleSaveNotifs} saving={saving} accentColor="#3b82f6" />
          </Sheet>
        )}

        {/* ── Blocked users ─────────────────────────────────────────────── */}
        {modal === MODAL.BLOCKED && (
          <Sheet title="Blocked Users" onClose={closeModal} scroll accentColor="var(--text-tertiary)">
            {loadingBlocked ? (
              <div style={S.emptyCenter}><Spinner size={22} /></div>
            ) : blockedUsers.length === 0 ? (
              <div style={S.emptyCenter}>
                <div style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Prohibit size={26} style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>No blocked users</p>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Users you block will appear here</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {blockedUsers.map(bu => {
                  const c    = getAvatarColor(bu.displayName || '')
                  const init = getInitials(bu.displayName || bu.email || '?')
                  return (
                    <div key={bu.uid} style={S.blockedRow}>
                      <div style={{ width: 42, height: 42, borderRadius: 13, overflow: 'hidden', flexShrink: 0, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {bu.photoURL
                          ? <img src={bu.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 14, fontWeight: 900, color: c.text }}>{init}</span>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={S.blockedName}>{bu.displayName || bu.email}</p>
                        {bu.username && <p style={S.blockedHandle}>@{bu.username}</p>}
                      </div>
                      <motion.button
                        onClick={() => handleUnblock(bu.uid)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        style={S.unblockBtn}
                      >
                        Unblock
                      </motion.button>
                    </div>
                  )
                })}
              </div>
            )}
          </Sheet>
        )}

        {/* ── Delete confirmation ───────────────────────────────────────── */}
        {deleteModal && (
          <motion.div
            style={S.overlay}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              style={S.deleteSheet}
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              transition={SPRING_SHEET}
              onClick={e => e.stopPropagation()}
            >
              <div style={S.warningWrap}>
                <motion.div
                  style={S.warningIcon}
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                >
                  <Warning size={28} weight="fill" />
                </motion.div>
                <h3 style={S.deleteTitle}>Delete account?</h3>
                <p style={S.deleteText}>
                  This permanently deletes your account, all messages, friends, and data. This cannot be undone.
                </p>
              </div>
              <div style={S.twoButtons}>
                <motion.button onClick={closeModal} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={S.secondaryBtn}>
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleDelete}
                  disabled={saving}
                  whileHover={!saving ? { scale: 1.02 } : {}}
                  whileTap={!saving ? { scale: 0.97 } : {}}
                  style={S.dangerBtn}
                >
                  {saving && <Spinner size={14} />}
                  {saving ? 'Deleting…' : 'Delete forever'}
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

function Sheet({ title, onClose, children, scroll = false, accentColor = 'var(--primary)' }) {
  return (
    <motion.div
      style={S.overlay}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        style={{ ...S.sheet, borderTop: `3px solid ${accentColor}`, ...(scroll ? { maxHeight: '88vh', overflowY: 'auto' } : {}) }}
        initial={{ y: 50, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0, scale: 0.96 }}
        transition={SPRING_SHEET}
        onClick={e => e.stopPropagation()}
      >
        <div style={S.sheetHeader}>
          <span style={S.sheetTitle}>{title}</span>
          <motion.button style={S.sheetClose} onClick={onClose} whileHover={{ rotate: 90, scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <X size={13} weight="bold" />
          </motion.button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function ModalHero({ icon, iconBg, iconColor, text }) {
  return (
    <div style={S.modalHero}>
      <div style={{ ...S.modalHeroIcon, background: iconBg, color: iconColor }}>{icon}</div>
      <p style={S.modalHeroText}>{text}</p>
    </div>
  )
}

function StatPill({ color, icon, label }) {
  return (
    <div style={{ ...S.statPill, borderColor: `${color}30` }}>
      <div style={{ ...S.statDot, background: color, boxShadow: `0 0 6px ${color}66` }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

function SectionLabel({ label }) {
  return <p style={S.sectionLabel}>{label}</p>
}

function Chevron() {
  return <CaretRight size={14} style={{ color: 'var(--text-tertiary)' }} />
}

function SettingRow({ Icon, label, value, labelColor, iconBg, iconColor, onClick, action, last }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ backgroundColor: 'var(--bg-secondary)' }}
      whileTap={{ scale: 0.99 }}
      style={{ ...S.settingRow, borderBottom: last ? 'none' : '1px solid var(--border)' }}
    >
      <div style={{ ...S.rowIcon, background: iconBg, color: iconColor }}>
        <Icon size={16} weight="fill" />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <p style={{ ...S.rowLabel, color: labelColor || 'var(--text-primary)' }}>{label}</p>
        {value && <p style={S.rowValue}>{value}</p>}
      </div>
      {action && <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{action}</div>}
    </motion.button>
  )
}

function Toggle({ on }) {
  return (
    <div style={{
      width: 42, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
      background: on ? 'var(--primary)' : 'var(--bg-tertiary, #3a3a3a)',
      boxShadow: on ? '0 2px 10px rgba(30,144,255,0.38)' : 'none',
      transition: 'background 0.2s, box-shadow 0.2s',
    }}>
      <motion.div
        animate={{ x: on ? 20 : 2 }}
        transition={SPRING_TOGGLE}
        style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 5px rgba(0,0,0,0.28)' }}
      />
    </div>
  )
}

function ToggleRow({ icon, iconColor, label, sub, value, onChange, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      paddingBottom: 14, marginBottom: last ? 0 : 14,
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: iconColor ? `${iconColor}18` : 'var(--bg-secondary)',
        color: iconColor || 'var(--text-secondary)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={S.toggleLabel}>{label}</p>
        <p style={S.toggleSub}>{sub}</p>
      </div>
      <motion.button
        onClick={() => onChange(!value)}
        whileTap={{ scale: 0.88 }}
        style={{
          width: 42, height: 24, borderRadius: 999, border: 'none',
          cursor: 'pointer', flexShrink: 0, padding: 0, position: 'relative',
          background: value ? 'var(--primary)' : 'var(--bg-tertiary, #3a3a3a)',
          boxShadow: value ? '0 2px 10px rgba(30,144,255,0.38)' : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
      >
        <motion.div
          animate={{ x: value ? 20 : 2 }}
          transition={SPRING_TOGGLE}
          style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 5px rgba(0,0,0,0.28)' }}
        />
      </motion.button>
    </div>
  )
}

function PwField({ label, field, pw, setPw, pwVis, setPwVis, autoFocus }) {
  return (
    <div>
      <p style={S.fieldLabel}>{label}</p>
      <div style={{ position: 'relative' }}>
        <input
          type={pwVis[field] ? 'text' : 'password'}
          value={pw[field]}
          onChange={e => setPw(prev => ({ ...prev, [field]: e.target.value }))}
          placeholder="••••••••"
          autoFocus={autoFocus}
          style={{ ...S.input, paddingRight: 44 }}
        />
        <button type="button" onClick={() => setPwVis(prev => ({ ...prev, [field]: !prev[field] }))} style={S.eyeBtn}>
          {pwVis[field] ? <EyeSlash size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

function PwStrength({ password }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)]
  const score  = checks.filter(Boolean).length
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e']
  return (
    <div style={{ marginTop: 10 }}>
      <div style={S.strengthBars}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, transition: 'background 0.3s', background: i <= score ? colors[score] : 'var(--border)' }} />
        ))}
      </div>
      {score > 0 && <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 600, color: colors[score] }}>{labels[score]}</p>}
    </div>
  )
}

function SaveBtn({ onClick, saving, label = 'Save', accentColor }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={saving}
      whileHover={!saving ? { scale: 1.02, y: -1 } : {}}
      whileTap={!saving ? { scale: 0.97 } : {}}
      style={{
        ...S.saveBtn,
        background: accentColor || 'var(--primary)',
        boxShadow: `0 6px 20px ${accentColor || 'rgba(30,144,255,0.3)'}44`,
        opacity: saving ? 0.8 : 1,
      }}
    >
      {saving ? <Spinner size={14} /> : <Check size={16} weight="bold" />}
      <span>{saving ? 'Saving…' : label}</span>
    </motion.button>
  )
}

function PreferenceDropdown({ id, icon, iconColor, label, value, options, onChange }) {
  const [open,       setOpen]   = useState(false)
  const [popupStyle, setPopup]  = useState(null)
  const rootRef                 = useRef(null)
  const selectedOption          = options.find(o => o.value === value)

  const recalcPopup = useCallback(() => {
    if (!rootRef.current) return
    try {
      const r = rootRef.current.getBoundingClientRect()
      setPopup({ left: Math.max(8, r.left), top: r.bottom + window.scrollY + 6, width: Math.max(200, r.width) })
    } catch { setPopup(null) }
  }, [])

  // Close when another dropdown opens or user clicks outside
  useEffect(() => {
    const onOther = e => { try { if (e?.detail !== id) setOpen(false) } catch { setOpen(false) } }
    const onDoc   = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('lc:dropdown-open', onOther)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('lc:dropdown-open', onOther)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [id])

  // Reposition on scroll or resize while open
  useEffect(() => {
    if (!open) return
    recalcPopup()
    window.addEventListener('resize', recalcPopup)
    window.addEventListener('scroll', recalcPopup, true)
    return () => {
      window.removeEventListener('resize', recalcPopup)
      window.removeEventListener('scroll', recalcPopup, true)
    }
  }, [open, recalcPopup])

  const toggle = useCallback((next) => {
    const n = typeof next === 'boolean' ? next : !open
    if (n) {
      window.dispatchEvent(new CustomEvent('lc:dropdown-open', { detail: id }))
      recalcPopup()
    }
    setOpen(n)
  }, [open, id, recalcPopup])

  return (
    <motion.button
      ref={rootRef}
      role="button"
      aria-expanded={open}
      tabIndex={0}
      onClick={() => toggle()}
      whileHover={{ backgroundColor: 'var(--bg-secondary)' }}
      whileTap={{ scale: 0.98 }}
      style={S.prefDropdown}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{ ...S.prefDropdownIcon, background: `${iconColor}18`, color: iconColor }}>{icon}</div>
        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <p style={S.prefLabel}>{label}</p>
          <p style={S.prefValue}>
            {selectedOption?.label}{selectedOption?.desc ? ` — ${selectedOption.desc}` : ''}
          </p>
        </div>
      </div>
      <CaretRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              left:  popupStyle?.left  ?? 0,
              top:   popupStyle?.top   ?? 0,
              width: popupStyle?.width ?? '100%',
              borderRadius: 14, border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              boxShadow: '0 16px 52px rgba(0,0,0,0.32)',
              zIndex: 3000, overflow: 'hidden',
            }}
          >
            {options.map((opt, idx) => {
              const OptIcon  = opt.icon
              const selected = opt.value === value
              return (
                <motion.button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); toggle(false) }}
                  whileHover={{ backgroundColor: 'var(--bg-secondary)' }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    ...S.dropdownOpt,
                    background: selected ? 'rgba(30,144,255,0.06)' : 'transparent',
                    color: selected ? 'var(--primary)' : 'var(--text-primary)',
                    borderBottom: idx < options.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selected ? 'rgba(30,144,255,0.14)' : 'var(--bg-secondary)',
                    color: selected ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                    <OptIcon size={16} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{opt.label}</p>
                    {opt.desc && <p style={{ margin: '3px 0 0', fontSize: 12, color: selected ? 'var(--primary)' : 'var(--text-tertiary)' }}>{opt.desc}</p>}
                  </div>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                    background: selected ? 'var(--primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Check size={10} weight="bold" style={{ color: '#fff' }} />}
                  </div>
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  // Layout
  page:        { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', flexShrink: 0 },
  backBtn:     { width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  headerTitle: { margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' },
  content:     { flex: 1, overflowY: 'auto', padding: '0 14px 36px' },

  // Profile card
  profileCard:      { width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: 16, marginTop: 16, borderRadius: 18, background: 'var(--bg-primary)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  profileCardAccent:{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--primary), #8b5cf6)', borderRadius: '18px 18px 0 0' },
  profileAvatar:    { width: 50, height: 50, borderRadius: 15, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.15)' },
  avatarImg:        { width: '100%', height: '100%', objectFit: 'cover' },
  profileName:      { margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  profileSub:       { margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  profileChevron:   { width: 26, height: 26, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 },

  // Stats row
  statsRow: { display: 'flex', gap: 8, marginTop: 10 },
  statPill: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'var(--bg-primary)', border: '1px solid', flexShrink: 0 },
  statDot:  { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  // Sections
  sectionLabel: { margin: '20px 0 7px 2px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' },

  // Setting cards
  card:       { borderRadius: 16, overflow: 'hidden', background: 'var(--bg-primary)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid var(--border)' },
  settingRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: 'none', textAlign: 'left', background: 'transparent', cursor: 'pointer' },
  rowIcon:    { width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { margin: 0, fontSize: 14, fontWeight: 700 },
  rowValue:   { margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Overlay + sheets
  overlay:     { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' },
  sheet:       { width: 'min(440px, calc(100vw - 32px))', background: 'var(--bg-primary)', borderRadius: 20, padding: '20px 22px 26px', boxShadow: '0 28px 72px rgba(0,0,0,0.5)' },
  deleteSheet: { width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-primary)', borderRadius: 20, padding: '28px 22px 22px', boxShadow: '0 28px 72px rgba(0,0,0,0.5)', borderTop: '3px solid #ef4444' },
  sheetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 },
  sheetTitle:  { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' },
  sheetClose:  { width: 28, height: 28, borderRadius: 9, border: 'none', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Modal hero banner
  modalHero:     { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-secondary)', borderRadius: 13, padding: '13px 14px', marginBottom: 16 },
  modalHeroIcon: { width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalHeroText: { margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 },

  // Reset bar
  resetBar:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  resetText: { margin: 0, fontSize: 12, color: 'var(--text-tertiary)', flex: 1 },
  resetBtn:  { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },

  // Password modal
  stack:        { display: 'flex', flexDirection: 'column', gap: 12 },
  matchRow:     { display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, fontWeight: 600 },
  strengthBars: { display: 'flex', gap: 4 },
  fieldLabel:   { margin: '0 0 7px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.01em' },
  input:        { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  eyeBtn:       { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' },

  // Notification toggles
  toggleList:  { display: 'flex', flexDirection: 'column', marginBottom: 4 },
  toggleLabel: { margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  toggleSub:   { margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' },

  // Privacy dropdowns
  privacyList:    { display: 'flex', flexDirection: 'column', marginBottom: 16 },
  prefDropdown:   { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', border: '1px solid var(--border)', borderRadius: 13, background: 'var(--bg-secondary)', cursor: 'pointer', position: 'relative', marginBottom: 9, justifyContent: 'space-between' },
  prefDropdownIcon:{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  prefLabel:      { margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  prefValue:      { margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dropdownOpt:    { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left' },

  // Save button
  saveBtn: { marginTop: 18, width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },

  // Delete modal
  warningWrap: { textAlign: 'center', paddingBottom: 20 },
  warningIcon: { width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#ef4444' },
  deleteTitle: { margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  deleteText:  { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 },
  twoButtons:  { display: 'flex', gap: 10 },
  secondaryBtn:{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  dangerBtn:   { flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },

  // Blocked users
  blockedRow:   { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderBottom: '1px solid var(--border)' },
  blockedName:  { margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  blockedHandle:{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' },
  unblockBtn:   { padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  emptyCenter:  { textAlign: 'center', padding: '36px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' },

  versionTag: { textAlign: 'center', margin: '24px 0 0', fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' },
}