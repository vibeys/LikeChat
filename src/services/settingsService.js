import {
  doc,
  setDoc,
  updateDoc,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from 'firebase/auth'
import { db } from '../lib/firebase'
import { getUser } from './userService'

export const DEFAULT_PRIVACY = {
  profileVisible: 'friends',
  lastSeenVisibility: 'friends',
  onlineStatusVisibility: 'friends',
  allowFriendReqsVisibility: 'friends',
  readReceiptsVisibility: 'friends',
}

export const DEFAULT_NOTIFICATIONS = {
  messages: true,
  mentions: true,
  friendReqs: true,
  appUpdates: false,
  sound: true,
}

const THEME_KEY = 'lc_theme'
const THEME_EVENT = 'lc-theme-change'

function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

export function sanitizePrivacy(privacy = {}) {
  const profileVisible = ['friends', 'nobody'].includes(privacy.profileVisible)
    ? privacy.profileVisible
    : DEFAULT_PRIVACY.profileVisible

  const lastSeenVisibility = ['friends', 'nobody'].includes(privacy.lastSeenVisibility)
    ? privacy.lastSeenVisibility
    : privacy.showLastSeen === false ? 'nobody' : DEFAULT_PRIVACY.lastSeenVisibility

  const onlineStatusVisibility = ['friends', 'nobody'].includes(privacy.onlineStatusVisibility)
    ? privacy.onlineStatusVisibility
    : privacy.showOnlineStatus === false ? 'nobody' : DEFAULT_PRIVACY.onlineStatusVisibility

  const allowFriendReqsVisibility = ['all', 'friends', 'nobody'].includes(privacy.allowFriendReqsVisibility)
    ? privacy.allowFriendReqsVisibility
    : privacy.allowFriendReqs === false ? 'nobody' : DEFAULT_PRIVACY.allowFriendReqsVisibility

  const readReceiptsVisibility = ['all', 'friends', 'nobody'].includes(privacy.readReceiptsVisibility)
    ? privacy.readReceiptsVisibility
    : privacy.readReceipts === false ? 'nobody' : DEFAULT_PRIVACY.readReceiptsVisibility

  return {
    profileVisible,
    lastSeenVisibility,
    onlineStatusVisibility,
    allowFriendReqsVisibility,
    readReceiptsVisibility,
    showLastSeen: lastSeenVisibility !== 'nobody',
    showOnlineStatus: onlineStatusVisibility !== 'nobody',
    allowFriendReqs: allowFriendReqsVisibility !== 'nobody',
    readReceipts: readReceiptsVisibility !== 'nobody',
  }
}

export function sanitizeNotifications(notifications = {}) {
  return {
    messages: asBoolean(notifications.messages, DEFAULT_NOTIFICATIONS.messages),
    mentions: asBoolean(notifications.mentions, DEFAULT_NOTIFICATIONS.mentions),
    friendReqs: asBoolean(notifications.friendReqs, DEFAULT_NOTIFICATIONS.friendReqs),
    appUpdates: asBoolean(notifications.appUpdates, DEFAULT_NOTIFICATIONS.appUpdates),
    sound: asBoolean(notifications.sound, DEFAULT_NOTIFICATIONS.sound),
  }
}

export function shouldDeliverNotification(notificationPrefs = {}, type = 'message') {
  const prefs = sanitizeNotifications(notificationPrefs)

  switch (type) {
    case 'message':
    case 'media':
    case 'reaction':
      return prefs.messages
    case 'mention':
      return prefs.mentions
    case 'friend_request':
    case 'friend_accepted':
    case 'group_invite':
      return prefs.friendReqs
    case 'announce':
      return prefs.appUpdates
    case 'call':
    case 'missed_call':
      return true
    default:
      return true
  }
}

// ── Privacy enforcement helpers ───────────────────────────────────────────────

/** Should we show this user's online status to the viewer?
 *  Respects the user's own showOnlineStatus toggle.
 *  Pass viewerRelation='friend' to also enforce friend-only gating if needed in future.
 */
export function canShowOnlineStatus(userData, viewerRelation = 'friend') {
  const privacy = sanitizePrivacy(userData?.privacy)
  if (privacy.onlineStatusVisibility === 'nobody') return false
  if (privacy.onlineStatusVisibility === 'friends') return viewerRelation === 'friend'
  return true
}

/** Should we show this user's last seen timestamp to the viewer? */
export function canShowLastSeen(userData, viewerRelation = 'friend') {
  const privacy = sanitizePrivacy(userData?.privacy)
  if (privacy.lastSeenVisibility === 'nobody') return false
  if (privacy.lastSeenVisibility === 'friends') return viewerRelation === 'friend'
  return true
}

/** Can others view this user's profile? Pass viewer's friendship status: 'friend' | 'stranger' */
export function canViewProfile(userData, viewerRelation = 'stranger') {
  const visibility = sanitizePrivacy(userData?.privacy).profileVisible
  if (visibility === 'friends') return viewerRelation === 'friend'
  if (visibility === 'nobody') return false
  return false // default deny
}

/** Can others send this user friend requests? */
export function canReceiveFriendRequests(userData) {
  return sanitizePrivacy(userData?.privacy).allowFriendReqs
}

/** Should notification sounds play for this user? */
export function shouldPlaySound(notificationPrefs = {}) {
  return sanitizeNotifications(notificationPrefs).sound
}

/** @deprecated use canShowOnlineStatus */
export function canShowProfilePhoto(userData) {
  return sanitizePrivacy(userData?.privacy).profileVisible !== 'nobody'
}

// ── Password ──────────────────────────────────────────────────────────────────

export async function changePassword(currentPassword, newPassword) {
  const auth = getAuth()
  const firebaseUser = auth.currentUser
  if (!firebaseUser) throw new Error('No authenticated user')
  if (!firebaseUser.email) throw new Error('This account does not use email/password.')

  const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword)
  await reauthenticateWithCredential(firebaseUser, credential)
  await updatePassword(firebaseUser, newPassword)
}

// ── Save settings ─────────────────────────────────────────────────────────────

export async function savePrivacySettings(uid, privacy) {
  if (!uid) throw new Error('Missing user id')
  await setDoc(
    doc(db, 'users', uid),
    { privacy: sanitizePrivacy(privacy) },
    { merge: true }
  )
}

export async function saveNotificationPrefs(uid, notifications) {
  if (!uid) throw new Error('Missing user id')
  await setDoc(
    doc(db, 'users', uid),
    { notifications: sanitizeNotifications(notifications) },
    { merge: true }
  )
}

// ── Blocked users ─────────────────────────────────────────────────────────────

export async function loadBlockedProfiles(uid) {
  const userSnap = await getUser(uid)
  const blockedUids = userSnap?.blockedUsers || []
  if (!blockedUids.length) return []

  const profiles = await Promise.all(blockedUids.map(buid => getUser(buid)))
  return profiles.filter(Boolean)
}

export async function unblockUser(uid, theirUid) {
  await updateDoc(doc(db, 'users', uid), {
    blockedUsers: arrayRemove(theirUid),
  })
}

// ── Account stats ─────────────────────────────────────────────────────────────

export async function fetchAccountStats(uid) {
  let messagesSent = 0
  let friendsCount = 0

  try {
    const convsSnap = await getDocs(
      query(collection(db, 'conversations'), where('members', 'array-contains', uid))
    )

    const counts = await Promise.all(
      convsSnap.docs.map(async convDoc => {
        const msgsSnap = await getDocs(
          query(
            collection(db, 'conversations', convDoc.id, 'messages'),
            where('senderId', '==', uid)
          )
        )
        return msgsSnap.size
      })
    )

    messagesSent = counts.reduce((sum, count) => sum + count, 0)
  } catch (err) {
    console.warn('fetchAccountStats messages error:', err?.message || err)
  }

  try {
    const friendsSnap = await getDocs(
      query(collection(db, 'friends', uid, 'list'), where('status', '==', 'accepted'))
    )
    friendsCount = friendsSnap.size
  } catch (err) {
    console.warn('fetchAccountStats friends error:', err?.message || err)
  }

  return { messagesSent, friendsCount }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export function getInitialTheme() {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'dark'
}

export function applyTheme(darkMode) {
  if (typeof window === 'undefined') return
  const theme = darkMode ? 'dark' : 'light'
  localStorage.setItem(THEME_KEY, theme)
  window.dispatchEvent(new Event(THEME_EVENT))
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export function toggleTheme(darkMode) {
  const next = !darkMode
  applyTheme(next)
  return next
}

export function getThemeEventName() {
  return THEME_EVENT
}