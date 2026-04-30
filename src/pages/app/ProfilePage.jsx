// src/pages/app/ProfilePage.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { updateProfile } from '../../services/userService'
import { logout } from '../../services/authService'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { getInitials, getAvatarColor } from '../../lib/utils'
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import {
  GoogleAuthProvider,
  EmailAuthProvider,
  RecaptchaVerifier,
  deleteUser,
  linkWithPhoneNumber,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  unlink,
} from 'firebase/auth'
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Edit2,
  Info,
  Link as LinkIcon,
  Lock,
  LogOut,
  Mail,
  Phone,
  Shield,
  Trash2,
  Unlink,
  User,
  UserX,
  X,
  Bell,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user, setUser, refreshUser } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    username: user?.username || '',
    bio: user?.bio || '',
  })

  const [modal, setModal] = useState(null)
  const [notifPrefs, setNotifPrefs] = useState({
    messages: user?.notifPrefs?.messages ?? true,
    friendRequests: user?.notifPrefs?.friendRequests ?? true,
    groupInvites: user?.notifPrefs?.groupInvites ?? true,
  })
  const [savingNotifs, setSavingNotifs] = useState(false)

  const [blockedUsers, setBlockedUsers] = useState([])
  const [loadingBlocked, setLoadingBlocked] = useState(false)

  const [phoneNumber, setPhoneNumber] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [confirmResult, setConfirmResult] = useState(null)

  const [deleteStep, setDeleteStep] = useState(1)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const providers = useMemo(
    () => auth.currentUser?.providerData?.map(p => p.providerId) || [],
    []
  )
  const hasGoogle = providers.includes('google.com')
  const hasPhone = providers.includes('phone')
  const hasEmail = providers.includes('password')

  const ac = getAvatarColor(user?.displayName || '')

  useEffect(() => {
    setForm({
      displayName: user?.displayName || '',
      username: user?.username || '',
      bio: user?.bio || '',
    })

    setNotifPrefs({
      messages: user?.notifPrefs?.messages ?? true,
      friendRequests: user?.notifPrefs?.friendRequests ?? true,
      groupInvites: user?.notifPrefs?.groupInvites ?? true,
    })
  }, [user])

  function openModal(name) {
    setModal(name)
    setOtpSent(false)
    setPhoneNumber('')
    setOtpCode('')
    setConfirmResult(null)
    setDeleteStep(1)
    setDeletePassword('')
    if (name === 'blocked') loadBlockedUsers()
  }

  async function loadBlockedUsers() {
    setLoadingBlocked(true)
    try {
      const blocked = user?.blockedUsers || []
      if (!blocked.length) {
        setBlockedUsers([])
        return
      }

      const profiles = await Promise.all(
        blocked.map(async uid => {
          const snap = await getDoc(doc(db, 'users', uid))
          return snap.exists()
            ? { uid, ...snap.data() }
            : { uid, displayName: 'Unknown User' }
        })
      )

      setBlockedUsers(profiles)
    } catch {
      toast.error('Failed to load blocked users')
    } finally {
      setLoadingBlocked(false)
    }
  }

  async function handleUnblock(targetUid) {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        blockedUsers: arrayRemove(targetUid),
      })

      setBlockedUsers(prev => prev.filter(u => u.uid !== targetUid))
      setUser(prev => ({
        ...prev,
        blockedUsers: (prev.blockedUsers || []).filter(u => u !== targetUid),
      }))

      toast.success('User unblocked')
    } catch {
      toast.error('Failed to unblock')
    }
  }

  async function saveNotifPrefs() {
    setSavingNotifs(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), { notifPrefs })
      setUser(prev => ({ ...prev, notifPrefs }))
      toast.success('Saved')
      setModal(null)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSavingNotifs(false)
    }
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
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    if (!form.displayName.trim()) return toast.error('Display name is required')
    if (!form.username.trim()) return toast.error('Username is required')

    const username = form.username.trim().toLowerCase()
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      return toast.error('Username: 3-20 chars, lowercase, _ or . only')
    }

    setSaving(true)
    try {
      await updateProfile(user.uid, {
        displayName: form.displayName.trim(),
        username,
        bio: form.bio.trim(),
      })

      setUser(prev => ({
        ...prev,
        displayName: form.displayName.trim(),
        username,
        bio: form.bio.trim(),
      }))

      setEditing(false)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoogleLink() {
    try {
      if (hasGoogle) {
        if (providers.length < 2) {
          return toast.error('You need at least one sign-in method linked')
        }

        await unlink(auth.currentUser, 'google.com')
        await refreshUser()
        toast.success('Google unlinked')
      } else {
        const provider = new GoogleAuthProvider()
        await linkWithPopup(auth.currentUser, provider)
        await refreshUser()
        toast.success('Google account linked')
      }
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user') return
      if (err?.code === 'auth/credential-already-in-use') {
        return toast.error('This Google account is already used by another user')
      }
      toast.error(err?.message || 'Failed')
    }
  }

  async function handleSendOTP() {
    if (!phoneNumber.trim()) return toast.error('Enter a phone number')
    if (!phoneNumber.startsWith('+')) {
      return toast.error('Include country code, like +63...')
    }

    setPhoneLoading(true)
    try {
      if (!window._recaptchaVerifier) {
        window._recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {},
        })
      }

      const result = await linkWithPhoneNumber(
        auth.currentUser,
        phoneNumber,
        window._recaptchaVerifier
      )

      setConfirmResult(result)
      setOtpSent(true)
      toast.success(`OTP sent to ${phoneNumber}`)
    } catch (err) {
      window._recaptchaVerifier = null
      if (err?.code === 'auth/credential-already-in-use') {
        toast.error('This phone is already linked to another account')
      } else {
        toast.error(err?.message || 'Failed to send OTP')
      }
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handleVerifyOTP() {
    if (!otpCode.trim()) return toast.error('Enter the OTP code')
    if (!confirmResult) return toast.error('Please send OTP first')

    setPhoneLoading(true)
    try {
      await confirmResult.confirm(otpCode)
      await updateDoc(doc(db, 'users', user.uid), {
        phone: phoneNumber,
        phoneVerified: true,
      })
      setUser(prev => ({ ...prev, phone: phoneNumber, phoneVerified: true }))
      await refreshUser()
      toast.success('Phone number verified')
      setModal(null)
    } catch (err) {
      if (err?.code === 'auth/invalid-verification-code') {
        toast.error('Wrong OTP code. Try again.')
      } else {
        toast.error(err?.message || 'Verification failed')
      }
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handleUnlinkPhone() {
    if (!window.confirm('Remove linked phone number?')) return
    try {
      await unlink(auth.currentUser, 'phone')
      await updateDoc(doc(db, 'users', user.uid), {
        phone: '',
        phoneVerified: false,
      })
      setUser(prev => ({ ...prev, phone: '', phoneVerified: false }))
      await refreshUser()
      toast.success('Phone unlinked')
    } catch (err) {
      toast.error(err?.message || 'Failed to unlink phone')
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true)
    try {
      if (hasEmail) {
        const cred = EmailAuthProvider.credential(user.email, deletePassword)
        await reauthenticateWithCredential(auth.currentUser, cred)
      } else if (hasGoogle) {
        const provider = new GoogleAuthProvider()
        await reauthenticateWithPopup(auth.currentUser, provider)
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
      if (err?.code === 'auth/wrong-password') {
        toast.error('Incorrect password')
      } else if (err?.code === 'auth/requires-recent-login') {
        toast.error('Please sign in again before deleting your account')
      } else if (err?.code === 'auth/popup-closed-by-user') {
        toast.error('Google sign-in popup was closed')
      } else {
        toast.error(err?.message || 'Failed to delete account')
      }

      setDeleteStep(1)
      setDeleteLoading(false)
    }
  }

  async function handleLogout() {
    if (!window.confirm('Log out of LikeChat?')) return
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Failed to logout')
    }
  }

  const memberSince = user?.createdAt?.seconds
    ? new Date(user.createdAt.seconds * 1000).toLocaleDateString()
    : '—'

  return (
    <div style={styles.page}>
      <div id="recaptcha-container" />

      <div style={styles.header}>
        <button
          onClick={() => navigate('/app/chats')}
          style={styles.backBtn}
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={styles.pageTitle}>Profile</h1>
          <p style={styles.pageSubtitle}>Manage your account and privacy</p>
        </div>

        {!editing ? (
          <button onClick={() => setEditing(true)} style={styles.editBtn}>
            <Edit2 size={14} />
            Edit
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                setEditing(false)
                setForm({
                  displayName: user?.displayName || '',
                  username: user?.username || '',
                  bio: user?.bio || '',
                })
              }}
              style={styles.iconBtn}
              title="Cancel"
            >
              <X size={18} />
            </button>

            <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
              <Check size={14} />
              Save
            </button>
          </div>
        )}
      </div>

      <div style={styles.content}>
        <div style={styles.heroCard}>
          <div style={styles.avatarWrap}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} style={styles.avatar} />
            ) : (
              <div style={{ ...styles.avatar, background: ac.bg, color: ac.text }}>
                {getInitials(user?.displayName || '')}
              </div>
            )}

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingPhoto}
              style={styles.cameraBtn}
              title="Change photo"
            >
              <Camera size={14} />
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handlePhotoChange}
            />
          </div>

          {!editing ? (
            <div style={styles.profileText}>
              <h2 style={styles.name}>{user?.displayName || 'Unknown'}</h2>
              <p style={styles.username}>@{user?.username || 'username'}</p>
              {user?.bio && <p style={styles.bio}>{user.bio}</p>}
            </div>
          ) : (
            <div style={styles.editForm}>
              <div>
                <label style={styles.label}>Display name</label>
                <input
                  value={form.displayName}
                  onChange={e =>
                    setForm(f => ({ ...f, displayName: e.target.value }))
                  }
                  placeholder="Your name"
                  maxLength={40}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>Username</label>
                <div style={styles.atRow}>
                  <span style={styles.atSign}>@</span>
                  <input
                    value={form.username}
                    onChange={e =>
                      setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))
                    }
                    placeholder="username"
                    maxLength={20}
                    style={{ ...styles.input, paddingLeft: '30px' }}
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>Bio</label>
                <textarea
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  placeholder="Tell people about yourself..."
                  maxLength={120}
                  rows={3}
                  style={styles.textarea}
                />
                <p style={styles.counter}>{form.bio.length}/120</p>
              </div>
            </div>
          )}
        </div>

        <SectionTitle label="Account" />
        <div style={styles.section}>
          <InfoRow icon={Mail} label="Email" value={user?.email || '—'} />
          <InfoRow
            icon={Phone}
            label="Phone"
            value={user?.phone || 'Not linked'}
            verified={user?.phone ? user?.phoneVerified : undefined}
          />
          <InfoRow icon={User} label="Member since" value={memberSince} />
        </div>

        <SectionTitle label="Linked Accounts" />
        <div style={styles.section}>
          <AccountRow
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            }
            title="Google"
            status={hasGoogle ? 'Linked' : 'Not linked'}
            statusColor={hasGoogle ? 'var(--success)' : 'var(--text-tertiary)'}
            action={
              <button onClick={handleGoogleLink} style={styles.linkBtn}>
                {hasGoogle ? (
                  <>
                    <Unlink size={12} /> Unlink
                  </>
                ) : (
                  <>
                    <LinkIcon size={12} /> Link
                  </>
                )}
              </button>
            }
          />

          <AccountRow
            icon={<Phone size={16} style={{ color: 'var(--primary)' }} />}
            title="Phone Number"
            status={user?.phone ? `Linked • ${user.phone}` : 'Not linked'}
            statusColor={hasPhone ? 'var(--success)' : 'var(--text-tertiary)'}
            action={
              hasPhone ? (
                <button onClick={handleUnlinkPhone} style={styles.unlinkBtn}>
                  <Unlink size={12} /> Unlink
                </button>
              ) : (
                <button onClick={() => openModal('phone')} style={styles.linkBtn}>
                  <LinkIcon size={12} /> Link
                </button>
              )
            }
          />
        </div>

        <SectionTitle label="Preferences" />
        <div style={styles.section}>
          <PrefRow icon={Bell} label="Notifications" onClick={() => openModal('notifications')} />
          <PrefRow icon={Lock} label="Privacy & Security" onClick={() => openModal('privacy')} />
          <PrefRow icon={Shield} label="Blocked Users" onClick={() => openModal('blocked')} />
        </div>

        <SectionTitle label="About" />
        <div style={styles.section}>
          <InfoRow icon={Info} label="Version" value="LikeChat v1.0.0" />
        </div>

        <SectionTitle label="Danger Zone" />
        <div style={{ ...styles.section, paddingBottom: '28px' }}>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            <LogOut size={16} />
            Log out
          </button>

          <button onClick={() => openModal('delete')} style={styles.deleteBtn}>
            <Trash2 size={16} />
            Delete Account
          </button>
        </div>
      </div>

      {modal && (
        <div style={styles.overlay} onClick={() => !deleteLoading && setModal(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            {modal === 'notifications' && (
              <div style={styles.modalInner}>
                <ModalHeader title="Notification Settings" onClose={() => setModal(null)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                  {[
                    { key: 'messages', label: 'New Messages', sub: 'Get notified when you receive a message' },
                    { key: 'friendRequests', label: 'Friend Requests', sub: 'Get notified when someone adds you' },
                    { key: 'groupInvites', label: 'Group Invites', sub: 'Get notified when added to a group' },
                  ].map(({ key, label, sub }) => (
                    <div key={key} style={styles.toggleCard}>
                      <div style={{ minWidth: 0 }}>
                        <p style={styles.toggleLabel}>{label}</p>
                        <p style={styles.toggleSub}>{sub}</p>
                      </div>

                      <button
                        onClick={() =>
                          setNotifPrefs(p => ({ ...p, [key]: !p[key] }))
                        }
                        style={{
                          ...styles.toggle,
                          background: notifPrefs[key] ? 'var(--primary)' : 'var(--bg-tertiary)',
                        }}
                      >
                        <span
                          style={{
                            ...styles.toggleKnob,
                            left: notifPrefs[key] ? '22px' : '2px',
                          }}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={saveNotifPrefs}
                  disabled={savingNotifs}
                  style={styles.primaryModalBtn}
                >
                  {savingNotifs ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            )}

            {modal === 'privacy' && (
              <div style={styles.modalInner}>
                <ModalHeader title="Privacy & Security" onClose={() => setModal(null)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                  {[
                    { label: 'Last Seen', sub: 'Everyone can see when you were last active' },
                    { label: 'Profile Photo', sub: 'Everyone can see your profile photo' },
                    { label: 'Friend Requests', sub: 'Anyone can send you a friend request' },
                  ].map(({ label, sub }) => (
                    <div key={label} style={styles.infoCardAlt}>
                      <p style={styles.cardTitle}>{label}</p>
                      <p style={styles.cardSub}>{sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modal === 'blocked' && (
              <div style={styles.modalInner}>
                <ModalHeader title="Blocked Users" onClose={() => setModal(null)} />
                {loadingBlocked ? (
                  <p style={styles.modalHint}>Loading blocked users...</p>
                ) : blockedUsers.length === 0 ? (
                  <EmptyModal icon={<UserX size={30} />} text="No blocked users" />
                ) : (
                  <div style={styles.blockedList}>
                    {blockedUsers.map(u => {
                      const ac2 = getAvatarColor(u.displayName || '')
                      return (
                        <div key={u.uid} style={styles.blockedRow}>
                          {u.photoURL ? (
                            <img src={u.photoURL} alt={u.displayName} style={styles.smallAvatar} />
                          ) : (
                            <div style={{ ...styles.smallAvatar, background: ac2.bg, color: ac2.text }}>
                              {getInitials(u.displayName || '')}
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={styles.blockedName}>{u.displayName || 'Unknown User'}</p>
                            {u.username && <p style={styles.blockedUser}>@{u.username}</p>}
                          </div>

                          <button onClick={() => handleUnblock(u.uid)} style={styles.unblockBtn}>
                            Unblock
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {modal === 'phone' && (
              <div style={styles.modalInner}>
                <ModalHeader title="Link Phone Number" onClose={() => setModal(null)} />
                <p style={styles.modalHint}>Link your phone to enable OTP sign-in</p>

                {!otpSent ? (
                  <>
                    <label style={styles.label}>Phone number (with country code)</label>
                    <input
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="+63 912 345 6789"
                      type="tel"
                      style={styles.input}
                    />
                    <p style={styles.noteText}>
                      Examples: +1 (US), +63 (PH), +44 (UK), +61 (AU)
                    </p>

                    <button onClick={handleSendOTP} disabled={phoneLoading} style={styles.primaryModalBtn}>
                      {phoneLoading ? 'Sending...' : 'Send OTP Code'}
                    </button>
                  </>
                ) : (
                  <>
                    <p style={styles.sentTo}>
                      Code sent to <strong>{phoneNumber}</strong>
                    </p>

                    <label style={styles.label}>Enter 6-digit OTP</label>
                    <input
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      style={styles.input}
                    />

                    <button onClick={handleVerifyOTP} disabled={phoneLoading} style={styles.primaryModalBtn}>
                      {phoneLoading ? 'Verifying...' : 'Verify & Link'}
                    </button>

                    <button
                      onClick={() => {
                        setOtpSent(false)
                        setOtpCode('')
                        setConfirmResult(null)
                      }}
                      style={styles.backLink}
                    >
                      ← Wrong number? Go back
                    </button>
                  </>
                )}
              </div>
            )}

            {modal === 'delete' && (
              <div style={styles.modalInner}>
                <ModalHeader
                  title="Delete Account"
                  onClose={() => !deleteLoading && setModal(null)}
                />

                {deleteStep === 1 && (
                  <>
                    <div style={styles.dangerHeader}>
                      <div style={styles.dangerIcon}>
                        <AlertTriangle size={26} color="#b91c1c" />
                      </div>
                      <p style={styles.dangerTitle}>
                        Permanently delete your account?
                      </p>
                    </div>

                    <div style={styles.warningBox}>
                      <p style={styles.warningTitle}>This will permanently:</p>
                      {[
                        'Delete your profile and account data',
                        'Remove you from all conversations',
                        'Delete all friend connections and notifications',
                        'This cannot be undone',
                      ].map(item => (
                        <p key={item} style={styles.warningItem}>
                          • {item}
                        </p>
                      ))}
                    </div>

                    <div style={styles.rowBtns}>
                      <button onClick={() => setModal(null)} style={styles.secondaryModalBtn}>
                        Cancel
                      </button>
                      <button onClick={() => setDeleteStep(2)} style={styles.dangerModalBtn}>
                        Continue
                      </button>
                    </div>
                  </>
                )}

                {deleteStep === 2 && (
                  <>
                    <p style={styles.modalHint}>
                      {hasEmail
                        ? 'Enter your password to confirm:'
                        : 'Re-authenticate with Google to confirm:'}
                    </p>

                    {hasEmail && (
                      <>
                        <label style={styles.label}>Current password</label>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={e => setDeletePassword(e.target.value)}
                          placeholder="Your password"
                          style={styles.input}
                        />
                      </>
                    )}

                    <div style={styles.rowBtns}>
                      <button onClick={() => setDeleteStep(1)} style={styles.secondaryModalBtn}>
                        Back
                      </button>
                      <button onClick={handleDeleteAccount} disabled={deleteLoading} style={styles.dangerModalBtn}>
                        {deleteLoading ? 'Deleting...' : 'Delete Forever'}
                      </button>
                    </div>
                  </>
                )}

                {deleteStep === 3 && (
                  <div style={styles.deletingState}>
                    <p style={styles.modalHint}>Deleting your account...</p>
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

function ModalHeader({ title, onClose }) {
  return (
    <div style={styles.modalHeader}>
      <h2 style={styles.modalTitle}>{title}</h2>
      <button onClick={onClose} style={styles.closeBtn} title="Close">
        <X size={18} />
      </button>
    </div>
  )
}

function SectionTitle({ label }) {
  return (
    <div style={styles.sectionHeader}>
      <p style={styles.sectionLabel}>{label}</p>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, verified }) {
  return (
    <div style={styles.infoRow}>
      <Icon size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.rowLabel}>{label}</p>
        <p style={styles.rowValue}>{value}</p>
      </div>
      {verified !== undefined && (
        <span
          style={{
            ...styles.statusPill,
            background: verified ? '#dcfce7' : '#fef3c7',
            color: verified ? '#15803d' : '#b45309',
          }}
        >
          {verified ? 'Verified' : 'Unverified'}
        </span>
      )}
    </div>
  )
}

function PrefRow({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} style={styles.prefRow}>
      <div style={styles.prefIconWrap}>
        <Icon size={16} />
      </div>
      <span style={styles.prefText}>{label}</span>
      <ChevronRight size={16} style={styles.prefChevron} />
    </button>
  )
}

function AccountRow({ icon, title, status, statusColor, action }) {
  return (
    <div style={styles.accountCard}>
      <div style={styles.accountIconWrap}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.accountTitle}>{title}</p>
        <p style={{ ...styles.accountStatus, color: statusColor }}>{status}</p>
      </div>
      {action}
    </div>
  )
}

function EmptyModal({ icon, text }) {
  return (
    <div style={styles.emptyModal}>
      <div style={styles.emptyModalIcon}>{icon}</div>
      <p style={styles.emptyModalText}>{text}</p>
    </div>
  )
}

const styles = {
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
    gap: '12px',
    padding: '16px 18px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
  },
  backBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  pageTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  pageSubtitle: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  editBtn: {
    border: 'none',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  saveBtn: {
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 18px 18px',
  },
  heroCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '18px',
    padding: '22px 18px',
    marginBottom: '16px',
  },
  avatarWrap: {
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
  },
  avatar: {
    width: '110px',
    height: '110px',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    fontWeight: 900,
    border: '1px solid var(--border)',
  },
  cameraBtn: {
    position: 'absolute',
    right: 'calc(50% - 54px)',
    bottom: '-2px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
  },
  profileText: {
    textAlign: 'center',
    marginTop: '16px',
  },
  name: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  username: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: 'var(--text-tertiary)',
  },
  bio: {
    margin: '10px auto 0',
    maxWidth: '360px',
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  editForm: {
    maxWidth: '460px',
    margin: '18px auto 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '12px',
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  atRow: {
    position: 'relative',
  },
  atSign: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-tertiary)',
    fontSize: '14px',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 13px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '12px 13px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    resize: 'none',
    boxSizing: 'border-box',
  },
  counter: {
    margin: '6px 0 0',
    fontSize: '11px',
    textAlign: 'right',
    color: 'var(--text-tertiary)',
  },
  sectionHeader: {
    padding: '18px 2px 8px',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 900,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '6px',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '13px 14px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  rowLabel: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    fontWeight: 700,
  },
  rowValue: {
    margin: '2px 0 0',
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusPill: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800,
    flexShrink: 0,
  },
  accountCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
  },
  accountIconWrap: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  accountStatus: {
    margin: '3px 0 0',
    fontSize: '12px',
    fontWeight: 700,
  },
  linkBtn: {
    border: '1px solid var(--border)',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    borderRadius: '12px',
    padding: '9px 12px',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  unlinkBtn: {
    border: '1px solid var(--border)',
    background: 'rgba(239,68,68,0.08)',
    color: 'var(--danger)',
    borderRadius: '12px',
    padding: '9px 12px',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  prefRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  prefIconWrap: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    background: 'var(--bg-secondary)',
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  prefText: {
    flex: 1,
    minWidth: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  prefChevron: {
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  },
  logoutBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '13px 14px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--danger)',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    marginBottom: '10px',
  },
  deleteBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '13px 14px',
    borderRadius: '16px',
    border: '1px solid #fca5a5',
    background: '#fee2e2',
    color: '#b91c1c',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '18px',
  },
  modal: {
    width: 'min(460px, 100%)',
    maxHeight: '90vh',
    overflow: 'hidden',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
  },
  modalInner: {
    padding: '18px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  toggleCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px',
    borderRadius: '16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  toggleLabel: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  toggleSub: {
    margin: '4px 0 0',
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'var(--text-tertiary)',
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '999px',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s ease',
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    transition: 'left 0.15s ease',
  },
  primaryModalBtn: {
    width: '100%',
    marginTop: '16px',
    padding: '12px 14px',
    borderRadius: '14px',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 900,
    cursor: 'pointer',
  },
  infoCardAlt: {
    padding: '14px',
    borderRadius: '16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  cardTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  cardSub: {
    margin: '4px 0 0',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-tertiary)',
  },
  noteText: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-tertiary)',
  },
  blockedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '16px',
    maxHeight: '320px',
    overflowY: 'auto',
    paddingRight: '2px',
  },
  blockedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
  },
  smallAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 900,
  },
  blockedName: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  blockedUser: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  unblockBtn: {
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--danger)',
    borderRadius: '12px',
    padding: '9px 12px',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer',
    flexShrink: 0,
  },
  modalHint: {
    margin: '8px 0 14px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--text-tertiary)',
  },
  sentTo: {
    margin: '0 0 12px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  backLink: {
    width: '100%',
    marginTop: '8px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary)',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    padding: '6px 0',
  },
  dangerHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px 0 8px',
    gap: '12px',
  },
  dangerIcon: {
    width: '58px',
    height: '58px',
    borderRadius: '50%',
    background: '#fee2e2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 900,
    textAlign: 'center',
    color: 'var(--text-primary)',
  },
  warningBox: {
    padding: '14px',
    borderRadius: '16px',
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    margin: '14px 0',
  },
  warningTitle: {
    margin: '0 0 8px',
    fontSize: '12px',
    fontWeight: 900,
    color: '#9a3412',
  },
  warningItem: {
    margin: '0 0 6px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#c2410c',
  },
  rowBtns: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px',
  },
  secondaryModalBtn: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: '14px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  dangerModalBtn: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: '14px',
    border: '1px solid #b91c1c',
    background: '#b91c1c',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 900,
    cursor: 'pointer',
  },
  deletingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '34px 0 16px',
    gap: '12px',
  },
  emptyModal: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 0 22px',
    gap: '10px',
  },
  emptyModalIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  emptyModalText: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-tertiary)',
  },
}