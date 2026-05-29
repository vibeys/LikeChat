import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { logout, deleteAccount } from '../../services/authService'
import {
  changePassword,
  savePrivacySettings,
  saveNotificationPrefs,
  loadBlockedProfiles,
  unblockUser,
  getInitialTheme,
  getThemeEventName,
  toggleTheme as toggleThemeService,
} from '../../services/settingsService'
import { goOnline } from '../../lib/presence'
import { getInitials, getAvatarColor } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  Lock,
  Sun,
  Moon,
  BellSimple,
  CaretRight,
  CaretLeft,
  X,
  Check,
  Users,
  UserCircle,
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
  At,
  SpeakerHigh,
  Megaphone,
  Prohibit,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

const M = {
  PASSWORD:      'password',
  PRIVACY:       'privacy',
  NOTIFICATIONS: 'notifications',
  BLOCKED:       'blocked',
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [modal,       setModal]       = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [darkMode,    setDarkMode]    = useState(() => getInitialTheme())

  const [pw,    setPw]    = useState({ current: '', next: '', confirm: '' })
  const [pwVis, setPwVis] = useState({ current: false, next: false, confirm: false })

  const [privacy, setPrivacy] = useState({
    profileVisible:   'friends',
    showLastSeen:     true,
    showOnlineStatus: true,
    allowFriendReqs:  true,
    readReceipts:     true,
  })

  const [notifs, setNotifs] = useState({
    messages:   true,
    mentions:   true,
    friendReqs: true,
    appUpdates: false,
    sound:      true,
  })

  const [blockedUsers,    setBlockedUsers]    = useState([])
  const [loadingBlocked,  setLoadingBlocked]  = useState(false)

  // Sync from user object
  useEffect(() => {
    if (user?.privacy)        setPrivacy(prev => ({ ...prev, ...user.privacy }))
    if (user?.notifications)  setNotifs(prev  => ({ ...prev, ...user.notifications }))
  }, [user])

  // Sync theme across tabs
  useEffect(() => {
    const sync = () => setDarkMode(getInitialTheme())
    const ev   = getThemeEventName()
    window.addEventListener('storage', sync)
    window.addEventListener(ev, sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(ev, sync) }
  }, [])

  // Load blocked users when blocked modal opens
  useEffect(() => {
    if (modal !== M.BLOCKED || !user?.uid) return
    setLoadingBlocked(true)
    loadBlockedProfiles(user.uid)
      .then(setBlockedUsers)
      .catch(() => toast.error('Failed to load blocked users'))
      .finally(() => setLoadingBlocked(false))
  }, [modal, user?.uid])

  const privacyLabel = useMemo(() => ({ friends: 'Friends only', nobody: 'Nobody' }), [])

  const notifsActive = Object.values(notifs).filter(Boolean).length
  const notifsTotal  = Object.keys(notifs).length
  const notifsValue  = notifsActive === notifsTotal ? 'All on'
    : notifsActive === 0 ? 'All off'
    : `${notifsActive} of ${notifsTotal} on`

  const privacyValue = `${privacyLabel[privacy.profileVisible] ?? 'Friends only'} · Online ${privacy.showOnlineStatus ? 'visible' : 'hidden'}`

  function closeModal() { setModal(null); setDeleteModal(false) }

  function handleToggleTheme() {
    const next = toggleThemeService(darkMode)
    setDarkMode(next)
  }

  async function handlePasswordChange() {
    if (!pw.current)           return toast.error('Enter your current password')
    if (pw.next.length < 8)    return toast.error('New password must be at least 8 characters')
    if (pw.next !== pw.confirm) return toast.error('Passwords do not match')

    setSaving(true)
    try {
      await changePassword(pw.current, pw.next)
      toast.success('Password changed!')
      setPw({ current: '', next: '', confirm: '' })
      setModal(null)
    } catch (err) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect')
      } else {
        toast.error(err?.message || 'Failed to change password')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePrivacy() {
    if (!user?.uid) return
    setSaving(true)
    try {
      await savePrivacySettings(user.uid, privacy)
      await refreshUser()
      goOnline(user.uid, privacy.showOnlineStatus)
      toast.success('Privacy settings saved!')
      setModal(null)
    } catch (err) {
      toast.error(err?.message || 'Failed to save privacy settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNotifs() {
    if (!user?.uid) return
    setSaving(true)
    try {
      await saveNotificationPrefs(user.uid, notifs)
      await refreshUser()
      toast.success('Notification preferences saved!')
      setModal(null)
    } catch (err) {
      toast.error(err?.message || 'Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleUnblock(theirUid) {
    if (!user?.uid) return
    try {
      await unblockUser(user.uid, theirUid)
      setBlockedUsers(prev => prev.filter(u => u.uid !== theirUid))
      toast.success('User unblocked')
    } catch {
      toast.error('Failed to unblock user')
    }
  }

  async function handleLogout() {
    try { await logout(); navigate('/login') }
    catch (err) { toast.error(err?.message || 'Failed to log out') }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteAccount()
      navigate('/login')
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err?.message || 'Failed to delete account')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  // Profile avatar
  const avatarColors = getAvatarColor(user.displayName || '')
  const initials     = getInitials(user.displayName || user.email || '?')

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <motion.button
          onClick={() => navigate('/app/profile')}
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
          style={S.backBtn}
        >
          <CaretLeft size={18} weight="bold" />
        </motion.button>
        <h2 style={S.headerTitle}>Settings</h2>
      </div>

      <div style={S.content}>

        {/* ── Profile card ─────────────────────────────────────── */}
        <motion.button
          onClick={() => navigate('/app/profile')}
          whileHover={{ scale: 1.01, backgroundColor: 'var(--bg-secondary)' }}
          whileTap={{ scale: 0.99 }}
          style={S.profileCard}
        >
          <div style={{
            width: 50, height: 50, borderRadius: 16, flexShrink: 0,
            overflow: 'hidden', background: avatarColors.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 18, fontWeight: 800, color: avatarColors.text }}>{initials}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.displayName || 'Your Profile'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.username ? `@${user.username}` : user.email}
            </p>
          </div>
          <CaretRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        </motion.button>

        {/* ── Preferences ──────────────────────────────────────── */}
        <SectionLabel label="Preferences" />
        <div style={S.card}>
          <Row
            Icon={darkMode ? Moon : Sun}
            label="Dark mode"
            value={darkMode ? 'On' : 'Off'}
            iconBg="rgba(245,158,11,0.14)"
            iconColor="#f59e0b"
            onClick={handleToggleTheme}
            action={<Toggle on={darkMode} />}
          />
          <Row
            Icon={BellSimple}
            label="Notifications"
            value={notifsValue}
            iconBg="rgba(59,130,246,0.14)"
            iconColor="#3b82f6"
            onClick={() => setModal(M.NOTIFICATIONS)}
            action={<CaretRight size={15} />}
          />
          <Row
            Icon={ShieldCheck}
            label="Privacy"
            value={privacyValue}
            iconBg="rgba(139,92,246,0.14)"
            iconColor="#8b5cf6"
            onClick={() => setModal(M.PRIVACY)}
            action={<CaretRight size={15} />}
            last
          />
        </div>

        {/* ── Security ─────────────────────────────────────────── */}
        <SectionLabel label="Security" />
        <div style={S.card}>
          <Row
            Icon={Lock}
            label="Change password"
            value="Keep your account secure"
            iconBg="rgba(34,197,94,0.14)"
            iconColor="#22c55e"
            onClick={() => {
              setPw({ current: '', next: '', confirm: '' })
              setPwVis({ current: false, next: false, confirm: false })
              setModal(M.PASSWORD)
            }}
            action={<CaretRight size={15} />}
            last
          />
        </div>

        {/* ── Account ──────────────────────────────────────────── */}
        <SectionLabel label="Account" />
        <div style={S.card}>
          <Row
            Icon={Prohibit}
            label="Blocked users"
            value="Manage who you've blocked"
            iconBg="rgba(156,163,175,0.14)"
            iconColor="var(--text-secondary)"
            onClick={() => setModal(M.BLOCKED)}
            action={<CaretRight size={15} />}
          />
          <Row
            Icon={SignOut}
            label="Sign out"
            value="See you soon"
            iconBg="rgba(156,163,175,0.1)"
            iconColor="var(--text-secondary)"
            onClick={handleLogout}
          />
          <Row
            Icon={Trash}
            label="Delete account"
            value="Permanently remove all data"
            labelColor="var(--danger)"
            iconColor="var(--danger)"
            iconBg="rgba(229,57,53,0.1)"
            onClick={() => setDeleteModal(true)}
            last
          />
        </div>

        <p style={S.versionTag}>LikeChat · v1.0</p>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
      <AnimatePresence>

        {/* Password */}
        {modal === M.PASSWORD && (
          <Sheet title="Change Password" onClose={closeModal}>
            {/* Security header */}
            <div style={S.modalHero}>
              <div style={{ ...S.modalHeroIcon, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                <Lock size={24} weight="fill" />
              </div>
              <p style={S.modalHeroText}>
                Use at least 8 characters with an uppercase letter, a number, and a symbol.
              </p>
            </div>

            <div style={S.stack}>
              <PwField label="Current password" field="current" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} autoFocus />
              <PwField label="New password"     field="next"    pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
              <PwField label="Confirm password" field="confirm" pw={pw} setPw={setPw} pwVis={pwVis} setPwVis={setPwVis} />
            </div>

            {pw.next ? <PwStrength password={pw.next} /> : null}

            {pw.confirm ? (
              <div style={{ ...S.matchRow, color: pw.next === pw.confirm ? 'var(--success)' : 'var(--danger)' }}>
                {pw.next === pw.confirm
                  ? <><CheckCircle size={13} weight="fill" /><span>Passwords match</span></>
                  : <><XCircle    size={13} weight="fill" /><span>Passwords do not match</span></>
                }
              </div>
            ) : null}

            <SaveBtn label="Change password" onClick={handlePasswordChange} saving={saving} color="#22c55e" />
          </Sheet>
        )}

        {/* Privacy */}
        {modal === M.PRIVACY && (
          <Sheet title="Privacy" onClose={closeModal} scroll accentColor="#8b5cf6">
            <div style={S.modalHero}>
              <div style={{ ...S.modalHeroIcon, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                <ShieldCheck size={24} weight="fill" />
              </div>
              <p style={S.modalHeroText}>
                Control who sees your profile and activity.
              </p>
            </div>

            <FieldLabel>Who can see your profile</FieldLabel>
            <div style={S.chips}>
              {[
                { v: 'friends', Icon: Users,      label: 'Friends only', desc: 'Only your friends can view your profile' },
                { v: 'nobody',  Icon: UserCircle, label: 'Nobody',       desc: 'Your profile is completely private'     },
              ].map(({ v, Icon, label, desc }) => (
                <VisChip
                  key={v} v={v} active={privacy.profileVisible}
                  Icon={Icon} label={label} desc={desc}
                  onSelect={val => setPrivacy(prev => ({ ...prev, profileVisible: val }))}
                />
              ))}
            </div>

            <FieldLabel>Activity &amp; Visibility</FieldLabel>
            <div style={S.toggleList}>
              <ToggleRow
                icon={<Eye size={15} />} iconColor="#3b82f6"
                label="Last seen"
                sub="Show friends when you were last active"
                value={privacy.showLastSeen}
                onChange={v => setPrivacy(prev => ({ ...prev, showLastSeen: v }))}
              />
              <ToggleRow
                icon={<WifiHigh size={15} />} iconColor="#22c55e"
                label="Online status"
                sub="Show friends when you're currently active"
                value={privacy.showOnlineStatus}
                onChange={v => setPrivacy(prev => ({ ...prev, showOnlineStatus: v }))}
              />
              <ToggleRow
                icon={<UserPlus size={15} />} iconColor="#8b5cf6"
                label="Friend requests"
                sub="Allow others to send you friend requests"
                value={privacy.allowFriendReqs}
                onChange={v => setPrivacy(prev => ({ ...prev, allowFriendReqs: v }))}
              />
              <ToggleRow
                icon={<CheckCircle size={15} />} iconColor="#f59e0b"
                label="Read receipts"
                sub="Let others see when you've read their messages"
                value={privacy.readReceipts}
                onChange={v => setPrivacy(prev => ({ ...prev, readReceipts: v }))}
                last
              />
            </div>

            <SaveBtn label="Save privacy settings" onClick={handleSavePrivacy} saving={saving} color="#8b5cf6" />
          </Sheet>
        )}

        {/* Notifications */}
        {modal === M.NOTIFICATIONS && (
          <Sheet title="Notifications" onClose={closeModal} scroll accentColor="#3b82f6">
            <div style={S.modalHero}>
              <div style={{ ...S.modalHeroIcon, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                <BellSimple size={24} weight="fill" />
              </div>
              <p style={S.modalHeroText}>
                Choose what alerts you receive from LikeChat.
              </p>
            </div>

            <div style={S.toggleList}>
              <ToggleRow
                icon={<ChatCircle size={15} />} iconColor="#3b82f6"
                label="Messages"
                sub="New messages in your chats"
                value={notifs.messages}
                onChange={v => setNotifs(prev => ({ ...prev, messages: v }))}
              />
              <ToggleRow
                icon={<At size={15} />} iconColor="#f59e0b"
                label="Mentions"
                sub="When someone @mentions you"
                value={notifs.mentions}
                onChange={v => setNotifs(prev => ({ ...prev, mentions: v }))}
              />
              <ToggleRow
                icon={<UserPlus size={15} />} iconColor="#8b5cf6"
                label="Friend requests"
                sub="New connection requests"
                value={notifs.friendReqs}
                onChange={v => setNotifs(prev => ({ ...prev, friendReqs: v }))}
              />
              <ToggleRow
                icon={<Megaphone size={15} />} iconColor="#22c55e"
                label="App updates"
                sub="New features and announcements"
                value={notifs.appUpdates}
                onChange={v => setNotifs(prev => ({ ...prev, appUpdates: v }))}
              />
              <ToggleRow
                icon={<SpeakerHigh size={15} />} iconColor="var(--primary)"
                label="Sounds"
                sub="Play sounds for notifications"
                value={notifs.sound}
                onChange={v => setNotifs(prev => ({ ...prev, sound: v }))}
                last
              />
            </div>

            <SaveBtn label="Save preferences" onClick={handleSaveNotifs} saving={saving} color="#3b82f6" />
          </Sheet>
        )}

        {/* Blocked users */}
        {modal === M.BLOCKED && (
          <Sheet title="Blocked Users" onClose={closeModal} scroll accentColor="var(--text-tertiary)">
            {loadingBlocked ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Spinner size={22} />
              </div>
            ) : blockedUsers.length === 0 ? (
              <div style={S.emptyBlocked}>
                <Prohibit size={36} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>No blocked users</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Users you block will appear here</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {blockedUsers.map(bu => {
                  const colors   = getAvatarColor(bu.displayName || '')
                  const initials = getInitials(bu.displayName || bu.email || '?')
                  return (
                    <div key={bu.uid} style={S.blockedRow}>
                      <div style={{ width: 38, height: 38, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {bu.photoURL
                          ? <img src={bu.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>{initials}</span>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {bu.displayName || bu.email}
                        </p>
                        {bu.username && (
                          <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>@{bu.username}</p>
                        )}
                      </div>
                      <motion.button
                        onClick={() => handleUnblock(bu.uid)}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
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

        {/* Delete confirmation */}
        {deleteModal && (
          <motion.div
            style={S.overlay}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              style={S.deleteSheet}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={S.warningWrap}>
                <div style={S.warningIcon}>
                  <Warning size={32} weight="fill" />
                </div>
                <h3 style={S.deleteTitle}>Delete account?</h3>
                <p style={S.deleteText}>
                  This permanently deletes your account, messages, and all data. This cannot be undone.
                </p>
              </div>
              <div style={S.twoButtons}>
                <motion.button onClick={closeModal} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={S.secondaryBtn}>
                  Cancel
                </motion.button>
                <motion.button onClick={handleDelete} disabled={saving} whileHover={!saving ? { scale: 1.02 } : {}} whileTap={!saving ? { scale: 0.97 } : {}} style={S.dangerBtn}>
                  {saving ? 'Deleting…' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Sheet({ title, onClose, children, scroll = false, accentColor = 'var(--primary)' }) {
  return (
    <motion.div
      style={S.overlay}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        style={{
          ...S.sheet,
          borderTop: `3px solid ${accentColor}`,
          ...(scroll ? { maxHeight: '88vh', overflowY: 'auto' } : {}),
        }}
        initial={{ y: 44, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 32, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={S.sheetHeader}>
          <span style={S.sheetTitle}>{title}</span>
          <motion.button style={S.sheetClose} onClick={onClose} whileHover={{ rotate: 90, scale: 1.06 }} whileTap={{ scale: 0.92 }}>
            <X size={15} />
          </motion.button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function Row({ Icon, label, value, labelColor, iconColor, iconBg, onClick, action, last }) {
  const Comp = onClick ? motion.button : 'div'
  return (
    <Comp
      onClick={onClick}
      whileHover={onClick ? { backgroundColor: 'var(--bg-secondary)' } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px', border: 'none', textAlign: 'left',
        background: 'transparent', cursor: onClick ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ ...S.rowIcon, background: iconBg || 'var(--primary-light)', color: iconColor || 'var(--primary)' }}>
        <Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...S.rowLabel, color: labelColor || 'var(--text-primary)' }}>{label}</p>
        {value ? <p style={S.rowValue}>{value}</p> : null}
      </div>
      {action ? <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{action}</div> : null}
    </Comp>
  )
}

function Toggle({ on }) {
  return (
    <div style={{ width: 40, height: 22, borderRadius: 999, flexShrink: 0, background: on ? 'var(--primary)' : 'var(--bg-tertiary,#3a3a3a)', position: 'relative', border: '1px solid var(--border)' }}>
      <motion.div
        animate={{ x: on ? 19 : 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        style={{ position: 'absolute', top: 1, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
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
      {/* Icon pill */}
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: iconColor ? `${iconColor}22` : 'var(--bg-secondary)',
        color: iconColor || 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <p style={S.toggleLabel}>{label}</p>
        <p style={S.toggleSub}>{sub}</p>
      </div>

      <motion.button
        onClick={() => onChange(!value)}
        whileTap={{ scale: 0.9 }}
        style={{
          width: 40, height: 22, borderRadius: 999, border: '1px solid var(--border)',
          cursor: 'pointer', flexShrink: 0, padding: 0,
          background: value ? 'var(--primary)' : 'var(--bg-tertiary,#3a3a3a)',
          position: 'relative',
        }}
      >
        <motion.div
          animate={{ x: value ? 19 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          style={{ position: 'absolute', top: 1, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
        />
      </motion.button>
    </div>
  )
}

function VisChip({ v, active, Icon, label, desc, onSelect }) {
  const on = active === v
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(v)}
      style={{
        flex: 1, padding: '14px 10px', borderRadius: 12,
        border: `2px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
        background: on ? 'var(--primary-light)' : 'var(--bg-secondary)',
        color: on ? 'var(--primary)' : 'var(--text-secondary)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, minHeight: 90,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: on ? 'rgba(30,144,255,0.15)' : 'var(--bg-tertiary,#2a2a2a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.01em' }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 500, color: on ? 'var(--primary)' : 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.3 }}>{desc}</span>
    </motion.button>
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
          style={{ ...S.input, paddingRight: 40 }}
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
    <div style={{ marginTop: 8 }}>
      <div style={S.strengthBars}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : 'var(--border)' }} />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: colors[score] || 'var(--text-tertiary)' }}>{score > 0 ? labels[score] : ''}</p>
    </div>
  )
}

function SectionLabel({ label }) {
  return <p style={S.sectionLabel}>{label}</p>
}

function FieldLabel({ children }) {
  return <p style={S.fieldLabel}>{children}</p>
}

function SaveBtn({ onClick, saving, label = 'Save', color }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={saving}
      whileHover={!saving ? { scale: 1.02, y: -1 } : {}}
      whileTap={!saving ? { scale: 0.97 } : {}}
      style={{
        ...S.saveBtn,
        background: color || 'var(--primary)',
        boxShadow: color ? `0 4px 16px ${color}44` : '0 4px 14px rgba(30,144,255,0.3)',
      }}
    >
      {saving ? <Spinner size={14} /> : <Check size={16} weight="bold" />}
      {saving ? 'Saving...' : label}
    </motion.button>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--bg-secondary)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', flexShrink: 0,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  content: { flex: 1, overflowY: 'auto', padding: '0 16px 32px' },

  // Profile card
  profileCard: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', marginTop: 16, borderRadius: 16,
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)', cursor: 'pointer', textAlign: 'left',
  },

  card: {
    borderRadius: 16, overflow: 'hidden', background: 'var(--bg-primary)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
  },
  sectionLabel: {
    margin: '20px 0 8px 4px', fontSize: 11, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)',
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { margin: 0, fontSize: 14, fontWeight: 700 },
  rowValue: { margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: 'min(440px, calc(100vw - 32px))', background: 'var(--bg-primary)',
    borderRadius: 18, padding: '20px 22px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  deleteSheet: {
    width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-primary)',
    borderRadius: 18, padding: '28px 24px 22px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    borderTop: '3px solid var(--danger)',
  },
  sheetHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' },
  sheetClose: {
    width: 30, height: 30, borderRadius: 9, border: 'none',
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Modal hero section
  modalHero: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-secondary)', borderRadius: 12,
    padding: '12px 14px', marginBottom: 18,
  },
  modalHeroIcon: {
    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalHeroText: {
    margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
  },

  input: {
    width: '100%', padding: '11px 12px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  },
  eyeBtn: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-tertiary)', padding: 4, display: 'flex',
  },
  strengthBars: { display: 'flex', gap: 4, marginBottom: 4 },
  saveBtn: {
    marginTop: 18, width: '100%', padding: 13, borderRadius: 12, border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  matchRow: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11 },

  chips: { display: 'flex', gap: 10, marginBottom: 20 },
  toggleList: { display: 'flex', flexDirection: 'column' },
  toggleLabel: { margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  toggleSub:   { margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' },
  fieldLabel:  { margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.02em' },

  warningWrap: { textAlign: 'center', paddingBottom: 22 },
  warningIcon: {
    width: 64, height: 64, borderRadius: 20, background: 'rgba(229,57,53,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 14px', color: 'var(--danger)',
  },
  deleteTitle: { margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  deleteText:  { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  twoButtons:  { display: 'flex', gap: 10 },
  secondaryBtn: {
    flex: 1, padding: 12, borderRadius: 12, border: '1px solid var(--border)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  dangerBtn: {
    flex: 1, padding: 12, borderRadius: 12, border: 'none',
    background: 'var(--danger)', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },

  // Blocked users
  blockedRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 2px', borderBottom: '1px solid var(--border)',
  },
  unblockBtn: {
    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  },
  emptyBlocked: {
    textAlign: 'center', padding: '32px 0',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },

  versionTag: {
    textAlign: 'center', margin: '24px 0 0',
    fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em',
  },
}