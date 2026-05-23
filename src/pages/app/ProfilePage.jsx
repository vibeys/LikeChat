// src/pages/app/ProfilePage.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { updateProfile } from '../../services/userService'
import { logout } from '../../services/authService'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { getInitials, getAvatarColor } from '../../lib/utils'
import {
  arrayRemove, collection, doc, getDoc, getDocs,
  updateDoc, writeBatch, query, where,
} from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import {
  GoogleAuthProvider, EmailAuthProvider, deleteUser,
  linkWithPopup, reauthenticateWithCredential, reauthenticateWithPopup,
  reload, unlink, updatePassword, sendEmailVerification,
} from 'firebase/auth'
import {
  ArrowLeft, Camera, Check, ChevronRight, Edit2, Info,
  Link as LinkIcon, Lock, LogOut, Mail, Shield, Trash2,
  Unlink, User, UserX, X, Bell, AlertTriangle, Eye, EyeOff,
  Key, Share2, Users, MessageCircle, Copy, CheckCheck,
  Sun, Moon, RefreshCw, Clock, Globe,
} from 'lucide-react'
import toast from 'react-hot-toast'

const THEME_KEY = 'lc_theme'

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark' } catch { return 'dark' }
}

export function applyTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
  const r = document.documentElement.style
  document.documentElement.setAttribute('data-theme', theme)
  if (theme === 'light') {
    r.setProperty('--bg-primary',     '#ffffff')
    r.setProperty('--bg-secondary',   '#f3f4f6')
    r.setProperty('--bg-tertiary',    '#e5e7eb')
    r.setProperty('--text-primary',   '#111827')
    r.setProperty('--text-secondary', '#374151')
    r.setProperty('--text-tertiary',  '#6b7280')
    r.setProperty('--border',         '#e5e7eb')
    r.setProperty('--bubble-in',      '#e5e7eb')
    r.setProperty('--bubble-in-text', '#111827')
    r.setProperty('--sidebar-bg',     '#f9fafb')
  } else {
    r.setProperty('--bg-primary',     '#111111')
    r.setProperty('--bg-secondary',   '#1a1a1a')
    r.setProperty('--bg-tertiary',    '#222222')
    r.setProperty('--text-primary',   '#f0f0f0')
    r.setProperty('--text-secondary', '#999999')
    r.setProperty('--text-tertiary',  '#555555')
    r.setProperty('--border',         '#252525')
    r.setProperty('--bubble-in',      '#1a1a1a')
    r.setProperty('--bubble-in-text', '#f0f0f0')
    r.setProperty('--sidebar-bg',     '#0a0a0a')
  }
}

export default function ProfilePage() {
  const { user, setUser, refreshUser } = useAuth()
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [editing,        setEditing]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [modal,          setModal]          = useState(null)
  const [theme,          setTheme]          = useState(getStoredTheme)
  const [copied,         setCopied]         = useState(false)
  const [stats,          setStats]          = useState({ friends: 0, groups: 0 })
  const [loadingStats,   setLoadingStats]   = useState(true)
  const [blockedUsers,   setBlockedUsers]   = useState([])
  const [loadingBlocked, setLoadingBlocked] = useState(false)

  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    username:    user?.username    || '',
    bio:         user?.bio         || '',
  })

  const [notifPrefs,   setNotifPrefs]   = useState({
    messages:       user?.notifPrefs?.messages       ?? true,
    friendRequests: user?.notifPrefs?.friendRequests ?? true,
    groupInvites:   user?.notifPrefs?.groupInvites   ?? true,
  })
  const [savingNotifs, setSavingNotifs] = useState(false)

  const [privacyPrefs,  setPrivacyPrefs]  = useState({
    lastSeen:       user?.privacyPrefs?.lastSeen       ?? 'everyone',
    profilePhoto:   user?.privacyPrefs?.profilePhoto   ?? 'everyone',
    friendRequests: user?.privacyPrefs?.friendRequests ?? 'everyone',
    readReceipts:   user?.privacyPrefs?.readReceipts   ?? true,
    onlineStatus:   user?.privacyPrefs?.onlineStatus   ?? true,
  })
  const [savingPrivacy, setSavingPrivacy] = useState(false)

  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [showPw,    setShowPw]    = useState({ current: false, next: false, confirm: false })

  const [deleteStep,     setDeleteStep]     = useState(1)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading,  setDeleteLoading]  = useState(false)

  const [verifyLoading,    setVerifyLoading]    = useState(false)
  const [checkingVerified, setCheckingVerified] = useState(false)

  const providers = useMemo(
    () => auth.currentUser?.providerData?.map(p => p.providerId) || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modal]
  )
  const hasGoogle = providers.includes('google.com')
  const hasEmail  = providers.includes('password')
  const ac = getAvatarColor(user?.displayName || '')

  useEffect(() => {
    setForm({ displayName: user?.displayName || '', username: user?.username || '', bio: user?.bio || '' })
    setNotifPrefs({
      messages:       user?.notifPrefs?.messages       ?? true,
      friendRequests: user?.notifPrefs?.friendRequests ?? true,
      groupInvites:   user?.notifPrefs?.groupInvites   ?? true,
    })
    setPrivacyPrefs({
      lastSeen:       user?.privacyPrefs?.lastSeen       ?? 'everyone',
      profilePhoto:   user?.privacyPrefs?.profilePhoto   ?? 'everyone',
      friendRequests: user?.privacyPrefs?.friendRequests ?? 'everyone',
      readReceipts:   user?.privacyPrefs?.readReceipts   ?? true,
      onlineStatus:   user?.privacyPrefs?.onlineStatus   ?? true,
    })
  }, [user])

  useEffect(() => { applyTheme(getStoredTheme()) }, [])

  useEffect(() => {
    if (!user?.uid) return
    setLoadingStats(true)
    const friendsP = getDocs(
      query(collection(db, 'friends', user.uid, 'list'), where('status', '==', 'accepted'))
    ).then(s => s.size).catch(() => 0)
    const groupsP = getDocs(
      query(collection(db, 'conversations'), where('type', '==', 'group'), where('members', 'array-contains', user.uid))
    ).then(s => s.size).catch(() => 0)
    Promise.all([friendsP, groupsP]).then(([friends, groups]) => {
      setStats({ friends, groups })
      setLoadingStats(false)
    })
  }, [user?.uid])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  function openModal(name) {
    setModal(name)
    setDeleteStep(1)
    setDeletePassword('')
    setPwForm({ current: '', next: '', confirm: '' })
    setShowPw({ current: false, next: false, confirm: false })
    if (name === 'blocked') loadBlockedUsers()
  }

  async function loadBlockedUsers() {
    setLoadingBlocked(true)
    try {
      const blocked = user?.blockedUsers || []
      if (!blocked.length) { setBlockedUsers([]); return }
      const profiles = await Promise.all(
        blocked.map(async uid => {
          const snap = await getDoc(doc(db, 'users', uid))
          return snap.exists() ? { uid, ...snap.data() } : { uid, displayName: 'Unknown User' }
        })
      )
      setBlockedUsers(profiles)
    } catch { toast.error('Failed to load blocked users') }
    finally   { setLoadingBlocked(false) }
  }

  async function handleSave() {
    if (!form.displayName.trim()) return toast.error('Display name is required')
    if (!form.username.trim())    return toast.error('Username is required')
    const username = form.username.trim().toLowerCase()
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) return toast.error('Username: 3-20 chars, lowercase, _ or . only')
    setSaving(true)
    try {
      await updateProfile(user.uid, { displayName: form.displayName.trim(), username, bio: form.bio.trim() })
      setUser(prev => ({ ...prev, displayName: form.displayName.trim(), username, bio: form.bio.trim() }))
      setEditing(false)
      toast.success('Profile updated')
    } catch (err) { toast.error(err?.message || 'Failed to update') }
    finally       { setSaving(false) }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const url = await uploadToCloudinary(file)
      await updateProfile(user.uid, { photoURL: url })
      setUser(prev => ({ ...prev, photoURL: url }))
      toast.success('Photo updated')
    } catch { toast.error('Failed to upload photo') }
    finally  { setUploadingPhoto(false); e.target.value = '' }
  }

  async function handleRemovePhoto() {
    try {
      await updateProfile(user.uid, { photoURL: '' })
      setUser(prev => ({ ...prev, photoURL: '' }))
      toast.success('Photo removed')
    } catch { toast.error('Failed to remove photo') }
  }

  async function handleSendVerification() {
    setVerifyLoading(true)
    try {
      await sendEmailVerification(auth.currentUser)
      toast.success('Verification email sent — check your inbox!')
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') toast.error('Too many requests, wait a bit then try again.')
      else toast.error(err?.message || 'Failed to send')
    } finally { setVerifyLoading(false) }
  }

  async function handleCheckVerified() {
    setCheckingVerified(true)
    try {
      await reload(auth.currentUser)
      const verified = auth.currentUser?.emailVerified ?? false
      if (verified) {
        await updateDoc(doc(db, 'users', user.uid), { emailVerified: true })
        setUser(prev => ({ ...prev, emailVerified: true }))
        toast.success('Email verified! ✓')
      } else {
        toast.error("Not verified yet — click the link in your inbox first.")
      }
    } catch (err) { toast.error(err?.message || 'Failed to check') }
    finally        { setCheckingVerified(false) }
  }

  async function handleGoogleLink() {
    try {
      if (hasGoogle) {
        if (providers.length < 2) return toast.error('You need at least one sign-in method before unlinking Google.')
        await unlink(auth.currentUser, 'google.com')
        await refreshUser()
        toast.success('Google account unlinked')
      } else {
        await linkWithPopup(auth.currentUser, new GoogleAuthProvider())
        await refreshUser()
        toast.success('Google account linked!')
      }
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user') return
      if (err?.code === 'auth/credential-already-in-use') return toast.error('This Google account is already used by another user.')
      if (err?.code === 'auth/email-already-in-use') return toast.error('That Google email is already linked to another account.')
      toast.error(err?.message || 'Failed')
    }
  }

  async function handleChangePassword() {
    if (!pwForm.current.trim())         return toast.error('Enter your current password')
    if (pwForm.next.length < 6)         return toast.error('New password must be at least 6 characters')
    if (pwForm.next !== pwForm.confirm) return toast.error('Passwords do not match')
    setPwLoading(true)
    try {
      const cred = EmailAuthProvider.credential(user.email, pwForm.current)
      await reauthenticateWithCredential(auth.currentUser, cred)
      await updatePassword(auth.currentUser, pwForm.next)
      toast.success('Password changed!')
      setModal(null)
    } catch (err) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') toast.error('Incorrect current password')
      else if (err?.code === 'auth/weak-password') toast.error('New password is too weak')
      else toast.error(err?.message || 'Failed')
    } finally { setPwLoading(false) }
  }

  async function saveNotifPrefs() {
    setSavingNotifs(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { notifPrefs })
      setUser(prev => ({ ...prev, notifPrefs }))
      toast.success('Notification preferences saved')
      setModal(null)
    } catch { toast.error('Failed to save') }
    finally   { setSavingNotifs(false) }
  }

  async function savePrivacyPrefs() {
    setSavingPrivacy(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { privacyPrefs })
      setUser(prev => ({ ...prev, privacyPrefs }))
      toast.success('Privacy settings saved')
      setModal(null)
    } catch { toast.error('Failed to save') }
    finally   { setSavingPrivacy(false) }
  }

  async function handleUnblock(targetUid) {
    try {
      await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayRemove(targetUid) })
      setBlockedUsers(prev => prev.filter(u => u.uid !== targetUid))
      setUser(prev => ({ ...prev, blockedUsers: (prev.blockedUsers || []).filter(u => u !== targetUid) }))
      toast.success('User unblocked')
    } catch { toast.error('Failed to unblock') }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    try {
      if (hasEmail) {
        const cred = EmailAuthProvider.credential(user.email, deletePassword)
        await reauthenticateWithCredential(auth.currentUser, cred)
      } else if (hasGoogle) {
        await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider())
      } else {
        return toast.error('No reauthentication method available')
      }
      setDeleteStep(3)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'users', user.uid))
      const friendsSnap = await getDocs(collection(db, 'friends', user.uid, 'list'))
      friendsSnap.forEach(d => batch.delete(d.ref))
      const notifsSnap = await getDocs(collection(db, 'notifications', user.uid, 'items'))
      notifsSnap.forEach(d => batch.delete(d.ref))
      await batch.commit()
      await deleteUser(auth.currentUser)
      navigate('/login', { replace: true })
    } catch (err) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') toast.error('Incorrect password')
      else if (err?.code === 'auth/requires-recent-login') toast.error('Please sign in again before deleting')
      else if (err?.code === 'auth/popup-closed-by-user') toast.error('Google sign-in was cancelled')
      else toast.error(err?.message || 'Failed to delete account')
      setDeleteStep(1)
      setDeleteLoading(false)
    }
  }

  async function handleLogout() {
    if (!window.confirm('Log out of LikeChat?')) return
    try { await logout(); navigate('/login', { replace: true }) }
    catch { toast.error('Failed to logout') }
  }

  function handleCopyUsername() {
    navigator.clipboard.writeText(`@${user?.username || ''}`).then(() => {
      setCopied(true)
      toast.success('Username copied!')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => toast.error('Failed to copy'))
  }

  const memberSince = user?.createdAt?.seconds
    ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—'

  const isEmailVerified = auth.currentUser?.emailVerified || false

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate('/app/chats')} style={S.iconBtn}><ArrowLeft size={18} /></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={S.pageTitle}>Profile</h1>
          <p style={S.pageSubtitle}>Manage your account and settings</p>
        </div>
        <button onClick={toggleTheme} style={S.iconBtn} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {!editing ? (
          <button onClick={() => setEditing(true)} style={S.editBtn}><Edit2 size={14} /> Edit</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setEditing(false); setForm({ displayName: user?.displayName || '', username: user?.username || '', bio: user?.bio || '' }) }} style={S.iconBtn}><X size={18} /></button>
            <button onClick={handleSave} disabled={saving} style={S.saveBtn}><Check size={14} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>

      <div style={S.content}>

        {/* Hero */}
        <div style={S.heroCard}>
          <div style={S.avatarWrap}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={S.avatar} />
              : <div style={{ ...S.avatar, background: ac.bg, color: ac.text }}>{getInitials(user?.displayName || '')}</div>
            }
            <button onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} style={S.cameraBtn}>
              {uploadingPhoto ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={14} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
          </div>

          {!editing ? (
            <div style={S.profileText}>
              <h2 style={S.name}>{user?.displayName || 'Unknown'}</h2>
              <div style={S.usernameRow}>
                <p style={S.username}>@{user?.username || 'username'}</p>
                <button onClick={handleCopyUsername} style={S.copyBtn}>
                  {copied ? <CheckCheck size={13} color="var(--primary)" /> : <Copy size={13} />}
                </button>
              </div>
              {user?.bio && <p style={S.bio}>{user.bio}</p>}

              <div style={S.statsRow}>
                <div style={S.statItem}>
                  <span style={S.statNum}>{loadingStats ? '—' : stats.friends}</span>
                  <span style={S.statLabel}>Friends</span>
                </div>
                <div style={S.statDivider} />
                <div style={S.statItem}>
                  <span style={S.statNum}>{loadingStats ? '—' : stats.groups}</span>
                  <span style={S.statLabel}>Groups</span>
                </div>
                <div style={S.statDivider} />
                <div style={S.statItem}>
                  <span style={S.statNum}>{user?.blockedUsers?.length || 0}</span>
                  <span style={S.statLabel}>Blocked</span>
                </div>
              </div>

              {hasEmail && !isEmailVerified && (
                <div style={S.verifyBanner}>
                  <Mail size={13} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>Email not verified</span>
                  <button onClick={handleSendVerification} disabled={verifyLoading} style={S.verifyLink}>
                    {verifyLoading ? 'Sending…' : 'Send link'}
                  </button>
                  <span style={{ color: '#b45309', opacity: 0.4, margin: '0 2px' }}>·</span>
                  <button onClick={handleCheckVerified} disabled={checkingVerified} style={S.verifyLink}>
                    {checkingVerified ? 'Checking…' : 'I verified'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={S.editForm}>
              <div>
                <label style={S.label}>Display name</label>
                <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Your name" maxLength={40} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Username</label>
                <div style={{ position: 'relative' }}>
                  <span style={S.atSign}>@</span>
                  <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} placeholder="username" maxLength={20} style={{ ...S.input, paddingLeft: 30 }} />
                </div>
                <p style={S.hint}>3-20 chars · lowercase, numbers, _ or .</p>
              </div>
              <div>
                <label style={S.label}>Bio</label>
                <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell people about yourself…" maxLength={120} rows={3} style={S.textarea} />
                <p style={{ ...S.hint, textAlign: 'right' }}>{form.bio.length}/120</p>
              </div>
              {user?.photoURL && (
                <button onClick={handleRemovePhoto} style={S.removePicBtn}><Trash2 size={13} /> Remove photo</button>
              )}
            </div>
          )}
        </div>

        {/* Account */}
        <SectionTitle label="Account" />
        <div style={S.section}>
          <InfoRow icon={Mail}  label="Email"        value={user?.email || '—'} badge={isEmailVerified ? { text: 'Verified', ok: true } : { text: 'Unverified', ok: false }} />
          <InfoRow icon={Clock} label="Member since" value={memberSince} />
          <InfoRow icon={User}  label="User ID"      value={user?.uid ? `${user.uid.slice(0, 14)}…` : '—'} small />
        </div>

        {/* Linked Accounts */}
        <SectionTitle label="Linked Accounts" />
        <div style={S.section}>
          <AccountRow
            icon={<GoogleIcon />}
            title="Google"
            status={hasGoogle ? 'Linked' : 'Not linked'}
            statusOk={hasGoogle}
            action={
              <button onClick={handleGoogleLink} style={hasGoogle ? S.unlinkBtn : S.linkBtn}>
                {hasGoogle ? <><Unlink size={12} /> Unlink</> : <><LinkIcon size={12} /> Link</>}
              </button>
            }
          />
          <AccountRow
            icon={<Mail size={16} style={{ color: 'var(--primary)' }} />}
            title="Email / Password"
            status={hasEmail ? `Linked · ${user?.email}` : 'Not linked'}
            statusOk={hasEmail}
            action={null}
          />
        </div>

        {/* Preferences */}
        <SectionTitle label="Preferences" />
        <div style={S.section}>
          <PrefRow icon={Bell}   label="Notifications"      sub="Manage message & invite alerts"  onClick={() => openModal('notifications')} />
          <PrefRow icon={Lock}   label="Privacy & Security" sub="Control who sees your info"      onClick={() => openModal('privacy')} />
          <PrefRow icon={Shield} label="Blocked Users"      sub={`${user?.blockedUsers?.length || 0} user${(user?.blockedUsers?.length || 0) !== 1 ? 's' : ''} blocked`} onClick={() => openModal('blocked')} />
          {hasEmail && <PrefRow icon={Key} label="Change Password" sub="Update your account password" onClick={() => openModal('password')} />}
          <PrefRow
            icon={theme === 'dark' ? Moon : Sun}
            label="Appearance"
            sub={`Currently ${theme === 'dark' ? 'dark' : 'light'} mode`}
            onClick={toggleTheme}
            rightEl={
              <div style={{ ...S.themePill, background: theme === 'dark' ? '#252525' : '#e5e7eb' }}>
                {theme === 'dark' ? <Moon size={11} /> : <Sun size={11} />}
                <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </div>
            }
          />
          <PrefRow icon={Share2} label="Share Profile" sub={`Share @${user?.username || 'your username'}`} onClick={() => openModal('share')} />
        </div>

        {/* About */}
        <SectionTitle label="About" />
        <div style={S.section}>
          <InfoRow icon={Info} label="Version" value="LikeChat v1.0.0" />
        </div>

        {/* Danger */}
        <SectionTitle label="Danger Zone" />
        <div style={{ ...S.section, paddingBottom: 32 }}>
          <button onClick={handleLogout}              style={S.logoutBtn}><LogOut size={16} /> Log out</button>
          <button onClick={() => openModal('delete')} style={S.deleteBtn}><Trash2 size={16} /> Delete Account</button>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <div style={S.overlay} onClick={() => !deleteLoading && setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>

            {modal === 'notifications' && (
              <div style={S.mi}>
                <ModalHeader title="Notification Settings" onClose={() => setModal(null)} />
                <p style={S.mhint}>Choose what you get notified about</p>
                <div style={S.stack}>
                  {[
                    { key: 'messages',       label: 'New Messages',    sub: 'Alert when you receive a message',      Icon: MessageCircle },
                    { key: 'friendRequests', label: 'Friend Requests', sub: 'Alert when someone sends you a request', Icon: Users },
                    { key: 'groupInvites',   label: 'Group Invites',   sub: 'Alert when you are added to a group',   Icon: Bell },
                  ].map(({ key, label, sub, Icon }) => (
                    <div key={key} style={S.toggleCard}>
                      <div style={S.tIcon}><Icon size={15} style={{ color: 'var(--primary)' }} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={S.tLabel}>{label}</p>
                        <p style={S.tSub}>{sub}</p>
                      </div>
                      <Toggle on={notifPrefs[key]} onToggle={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))} />
                    </div>
                  ))}
                </div>
                <button onClick={saveNotifPrefs} disabled={savingNotifs} style={S.primaryBtn}>
                  {savingNotifs ? 'Saving…' : 'Save Preferences'}
                </button>
              </div>
            )}

            {modal === 'privacy' && (
              <div style={S.mi}>
                <ModalHeader title="Privacy & Security" onClose={() => setModal(null)} />
                <p style={S.mhint}>Control who can see your information</p>
                <div style={S.stack}>
                  <div style={S.toggleCard}>
                    <div style={S.tIcon}><CheckCheck size={15} style={{ color: 'var(--primary)' }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={S.tLabel}>Read Receipts</p>
                      <p style={S.tSub}>Show when you've read messages</p>
                    </div>
                    <Toggle on={privacyPrefs.readReceipts} onToggle={() => setPrivacyPrefs(p => ({ ...p, readReceipts: !p.readReceipts }))} />
                  </div>
                  <div style={S.toggleCard}>
                    <div style={S.tIcon}><Globe size={15} style={{ color: 'var(--primary)' }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={S.tLabel}>Show Online Status</p>
                      <p style={S.tSub}>Let others see when you're active</p>
                    </div>
                    <Toggle on={privacyPrefs.onlineStatus} onToggle={() => setPrivacyPrefs(p => ({ ...p, onlineStatus: !p.onlineStatus }))} />
                  </div>
                  <PrivacySelect label="Last Seen"       sub="Who can see when you were last active" icon={Clock}  value={privacyPrefs.lastSeen}       onChange={v => setPrivacyPrefs(p => ({ ...p, lastSeen: v }))} />
                  <PrivacySelect label="Profile Photo"   sub="Who can see your profile photo"        icon={Camera} value={privacyPrefs.profilePhoto}    onChange={v => setPrivacyPrefs(p => ({ ...p, profilePhoto: v }))} />
                  <PrivacySelect label="Friend Requests" sub="Who can send you a friend request"     icon={Users}  value={privacyPrefs.friendRequests}  onChange={v => setPrivacyPrefs(p => ({ ...p, friendRequests: v }))} />
                </div>
                <button onClick={savePrivacyPrefs} disabled={savingPrivacy} style={S.primaryBtn}>
                  {savingPrivacy ? 'Saving…' : 'Save Privacy Settings'}
                </button>
              </div>
            )}

            {modal === 'blocked' && (
              <div style={S.mi}>
                <ModalHeader title="Blocked Users" onClose={() => setModal(null)} />
                {loadingBlocked ? (
                  <div style={S.center}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-tertiary)' }} /></div>
                ) : blockedUsers.length === 0 ? (
                  <EmptyState icon={<UserX size={28} />} text="No blocked users" sub="People you block won't be able to message you" />
                ) : (
                  <div style={{ ...S.stack, maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
                    {blockedUsers.map(u => {
                      const ac2 = getAvatarColor(u.displayName || '')
                      return (
                        <div key={u.uid} style={S.blockedRow}>
                          {u.photoURL
                            ? <img src={u.photoURL} alt="" style={S.smallAv} />
                            : <div style={{ ...S.smallAv, background: ac2.bg, color: ac2.text }}>{getInitials(u.displayName || '')}</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={S.bName}>{u.displayName || 'Unknown'}</p>
                            {u.username && <p style={S.bUser}>@{u.username}</p>}
                          </div>
                          <button onClick={() => handleUnblock(u.uid)} style={S.unlinkBtn}>Unblock</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {modal === 'password' && (
              <div style={S.mi}>
                <ModalHeader title="Change Password" onClose={() => setModal(null)} />
                <p style={S.mhint}>Use at least 6 characters for your new password</p>
                <div style={S.stack}>
                  {[
                    { key: 'current', label: 'Current password',    placeholder: 'Enter current password' },
                    { key: 'next',    label: 'New password',         placeholder: 'At least 6 characters' },
                    { key: 'confirm', label: 'Confirm new password', placeholder: 'Repeat new password' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={S.label}>{label}</label>
                      <div style={{ position: 'relative' }}>
                        <input type={showPw[key] ? 'text' : 'password'} value={pwForm[key]} onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} style={{ ...S.input, paddingRight: 44 }} />
                        <button onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))} type="button" style={S.eyeBtn}>
                          {showPw[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {pwForm.next && pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p style={S.errText}>Passwords don't match</p>
                )}
                <button onClick={handleChangePassword} disabled={pwLoading} style={S.primaryBtn}>
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            )}

            {modal === 'share' && (
              <div style={S.mi}>
                <ModalHeader title="Share Profile" onClose={() => setModal(null)} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 8px', gap: 6 }}>
                  {user?.photoURL
                    ? <img src={user.photoURL} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                    : <div style={{ width: 80, height: 80, borderRadius: '50%', background: ac.bg, color: ac.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, border: '2px solid var(--border)' }}>{getInitials(user?.displayName || '')}</div>
                  }
                  <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{user?.displayName}</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>@{user?.username}</p>
                  {user?.bio && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 260 }}>{user.bio}</p>}
                </div>
                <button onClick={handleCopyUsername} style={S.primaryBtn}>
                  {copied ? <><CheckCheck size={14} /> Copied!</> : <><Copy size={14} /> Copy @{user?.username}</>}
                </button>
                <p style={{ ...S.hint, textAlign: 'center', marginTop: 10 }}>Share your @username so friends can find you</p>
              </div>
            )}

            {modal === 'delete' && (
              <div style={S.mi}>
                <ModalHeader title="Delete Account" onClose={() => !deleteLoading && setModal(null)} />
                {deleteStep === 1 && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0 8px' }}>
                      <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertTriangle size={26} color="#b91c1c" />
                      </div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', textAlign: 'center' }}>Permanently delete your account?</p>
                    </div>
                    <div style={{ padding: 14, borderRadius: 14, background: '#fff7ed', border: '1px solid #fed7aa', margin: '12px 0' }}>
                      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 900, color: '#9a3412' }}>This will permanently:</p>
                      {['Delete your profile and all account data', 'Remove you from all conversations', 'Delete all friend connections', 'Cannot be undone'].map(i => (
                        <p key={i} style={{ margin: '0 0 4px', fontSize: 12, color: '#c2410c' }}>• {i}</p>
                      ))}
                    </div>
                    <div style={S.rowBtns}>
                      <button onClick={() => setModal(null)} style={S.secondaryBtn}>Cancel</button>
                      <button onClick={() => setDeleteStep(2)} style={S.dangerBtn}>Continue</button>
                    </div>
                  </>
                )}
                {deleteStep === 2 && (
                  <>
                    <p style={S.mhint}>{hasEmail ? 'Enter your password to confirm:' : 'Re-authenticate with Google to confirm:'}</p>
                    {hasEmail && (
                      <>
                        <label style={S.label}>Password</label>
                        <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Your current password" style={S.input} />
                      </>
                    )}
                    <div style={S.rowBtns}>
                      <button onClick={() => setDeleteStep(1)} style={S.secondaryBtn}>Back</button>
                      <button onClick={handleDeleteAccount} disabled={deleteLoading} style={S.dangerBtn}>
                        {deleteLoading ? 'Deleting…' : 'Delete Forever'}
                      </button>
                    </div>
                  </>
                )}
                {deleteStep === 3 && (
                  <div style={S.center}>
                    <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-tertiary)' }} />
                    <p style={S.mhint}>Deleting your account…</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function Toggle({ on, onToggle }) {
  return (
    <button onClick={onToggle} style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--primary)' : 'var(--bg-tertiary)', transition: 'background 0.15s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
    </button>
  )
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>{title}</h2>
      <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  )
}

function SectionTitle({ label }) {
  return <div style={{ padding: '18px 2px 8px' }}><p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</p></div>
}

function InfoRow({ icon: Icon, label, value, badge, small }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
      <Icon size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: small ? 11 : 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: small ? 'monospace' : 'inherit' }}>{value}</p>
      </div>
      {badge && (
        <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, flexShrink: 0, background: badge.ok ? '#dcfce7' : '#fef3c7', color: badge.ok ? '#15803d' : '#b45309' }}>
          {badge.text}
        </span>
      )}
    </div>
  )
}

function PrefRow({ icon: Icon, label, sub, onClick, rightEl }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--bg-secondary)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</span>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>{sub}</p>}
      </div>
      {rightEl || <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
    </button>
  )
}

function AccountRow({ icon, title, status, statusOk, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</p>
        <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 700, color: statusOk ? '#22c55e' : 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</p>
      </div>
      {action}
    </div>
  )
}

function PrivacySelect({ label, sub, icon: Icon, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(30,144,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} style={{ color: 'var(--primary)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{label}</p>
        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</p>
      </div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, padding: '7px 10px', cursor: 'pointer', flexShrink: 0, outline: 'none' }}>
        <option value="everyone">Everyone</option>
        <option value="friends">Friends only</option>
        <option value="nobody">Nobody</option>
      </select>
    </div>
  )
}

function EmptyState({ icon, text, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0 16px', gap: 8 }}>
      <div style={{ width: 58, height: 58, borderRadius: 18, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)' }}>{text}</p>
      {sub && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', maxWidth: 240 }}>{sub}</p>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page:        { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', flexShrink: 0 },
  pageTitle:   { margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' },
  pageSubtitle:{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-tertiary)' },
  iconBtn:     { width: 38, height: 38, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  editBtn:     { border: 'none', background: 'rgba(30,144,255,0.12)', color: 'var(--primary)', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  saveBtn:     { border: 'none', background: 'var(--primary)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  content:     { flex: 1, overflowY: 'auto', padding: '16px 18px 18px' },
  heroCard:    { background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, padding: '22px 18px', marginBottom: 16 },
  avatarWrap:  { display: 'flex', justifyContent: 'center', position: 'relative' },
  avatar:      { width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, border: '2px solid var(--border)' },
  cameraBtn:   { position: 'absolute', right: 'calc(50% - 54px)', bottom: -2, width: 34, height: 34, borderRadius: '50%', border: '2px solid var(--bg-primary)', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
  profileText: { textAlign: 'center', marginTop: 16 },
  name:        { margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' },
  usernameRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  username:    { margin: 0, fontSize: 13, color: 'var(--text-tertiary)' },
  copyBtn:     { border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 6 },
  bio:         { margin: '10px auto 0', maxWidth: 360, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' },
  statsRow:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 18, padding: '14px 0 4px', borderTop: '1px solid var(--border)' },
  statItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statNum:     { fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 },
  statLabel:   { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  statDivider: { width: 1, height: 30, background: 'var(--border)' },
  verifyBanner:{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fef3c7', color: '#b45309', fontSize: 12, fontWeight: 700 },
  verifyLink:  { border: 'none', background: 'transparent', color: '#b45309', fontSize: 12, fontWeight: 900, cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 },
  editForm:    { maxWidth: 460, margin: '18px auto 0', display: 'flex', flexDirection: 'column', gap: 14 },
  label:       { display: 'block', marginBottom: 7, fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' },
  atSign:      { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none' },
  input:       { width: '100%', padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  textarea:    { width: '100%', padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' },
  hint:        { margin: '5px 0 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 },
  removePicBtn:{ border: '1px solid var(--border)', background: 'transparent', color: '#ef4444', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' },
  section:     { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 6 },
  linkBtn:     { border: '1px solid var(--border)', background: 'rgba(30,144,255,0.12)', color: 'var(--primary)', borderRadius: 12, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  unlinkBtn:   { border: '1px solid var(--border)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderRadius: 12, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  themePill:   { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', flexShrink: 0 },
  logoutBtn:   { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 14px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: '#ef4444', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginBottom: 10 },
  deleteBtn:   { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 14px', borderRadius: 16, border: '1px solid #fca5a5', background: '#fee2e2', color: '#b91c1c', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  overlay:     { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal:       { width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-primary)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' },
  mi:          { padding: 20 },
  mhint:       { margin: '8px 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--text-tertiary)' },
  stack:       { display: 'flex', flexDirection: 'column', gap: 10 },
  toggleCard:  { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' },
  tIcon:       { width: 34, height: 34, borderRadius: 10, background: 'rgba(30,144,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tLabel:      { margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' },
  tSub:        { margin: '3px 0 0', fontSize: 11, lineHeight: 1.45, color: 'var(--text-tertiary)' },
  primaryBtn:  { width: '100%', marginTop: 16, padding: '12px 14px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtn:{ flex: 1, padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  dangerBtn:   { flex: 1, padding: '12px 14px', borderRadius: 14, border: '1px solid #b91c1c', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' },
  rowBtns:     { display: 'flex', gap: 10, marginTop: 10 },
  eyeBtn:      { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 },
  errText:     { margin: '8px 0 0', fontSize: 12, color: '#ef4444', fontWeight: 700 },
  blockedRow:  { display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' },
  smallAv:     { width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 },
  bName:       { margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bUser:       { margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary)' },
  center:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0 16px', gap: 12 },
}