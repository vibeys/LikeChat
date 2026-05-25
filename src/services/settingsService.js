// src/services/settingsService.js
// ─── Dedicated settings service – handles all user settings operations ────────

import {
  doc,
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

// ─── PASSWORD ────────────────────────────────────────────────────────────────

export async function changePassword(currentPassword, newPassword) {
  const auth = getAuth()
  const firebaseUser = auth.currentUser
  if (!firebaseUser) throw new Error('No authenticated user')

  const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword)
  await reauthenticateWithCredential(firebaseUser, credential)
  await updatePassword(firebaseUser, newPassword)
}

// ─── PRIVACY ─────────────────────────────────────────────────────────────────

export async function savePrivacySettings(uid, privacy) {
  await updateDoc(doc(db, 'users', uid), { privacy })
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export async function saveNotificationPrefs(uid, notifications) {
  await updateDoc(doc(db, 'users', uid), { notifications })
}

// ─── BLOCKED USERS ───────────────────────────────────────────────────────────

export async function loadBlockedProfiles(uid) {
  const userSnap = await getUser(uid)
  const blockedUids = userSnap?.blockedUsers || []
  if (!blockedUids.length) return []
  const profiles = await Promise.all(
    blockedUids.map(buid => getUser(buid))
  )
  return profiles.filter(Boolean)
}

export async function unblockUser(uid, theirUid) {
  await updateDoc(doc(db, 'users', uid), {
    blockedUsers: arrayRemove(theirUid),
  })
}

// ─── ACCOUNT STATS ───────────────────────────────────────────────────────────

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
    messagesSent = counts.reduce((a, b) => a + b, 0)
  } catch (_) {}

  try {
    const friendsSnap = await getDocs(
      query(collection(db, 'friends', uid, 'list'), where('status', '==', 'accepted'))
    )
    friendsCount = friendsSnap.size
  } catch (_) {}

  return { messagesSent, friendsCount }
}

// ─── THEME ───────────────────────────────────────────────────────────────────

export function getInitialTheme() {
  return document.documentElement.getAttribute('data-theme') !== 'light'
}

export function toggleTheme(darkMode) {
  const next = !darkMode
  document.documentElement.setAttribute('data-theme', next ? '' : 'light')
  localStorage.setItem('theme', next ? 'dark' : 'light')
  return next
}