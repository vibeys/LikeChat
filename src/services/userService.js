import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  startAt,
  endAt,
  serverTimestamp,
} from 'firebase/firestore'
import { updateProfile as firebaseUpdateProfile } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { uploadToCloudinary } from '../lib/cloudinary'
import { DEFAULT_NOTIFICATIONS, DEFAULT_PRIVACY, sanitizeNotifications, sanitizePrivacy } from './settingsService'

function withDefaults(userData = {}) {
  return {
    ...userData,
    privacy: sanitizePrivacy(userData.privacy || DEFAULT_PRIVACY),
    notifications: sanitizeNotifications(userData.notifications || DEFAULT_NOTIFICATIONS),
  }
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? withDefaults({ uid, ...snap.data() }) : null
}

export async function updateProfile(uid, data) {
  const { photoFile, privacy, notifications, ...rest } = data
  const authUser = auth.currentUser

  const patch = {
    ...rest,
    lastSeen: serverTimestamp(),
  }

  if (photoFile) {
    patch.photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }

  if (privacy) patch.privacy = sanitizePrivacy(privacy)
  if (notifications) patch.notifications = sanitizeNotifications(notifications)

  await setDoc(doc(db, 'users', uid), patch, { merge: true })

  if (authUser?.uid === uid) {
    const authPatch = {}
    if (typeof rest.displayName === 'string') authPatch.displayName = rest.displayName
    if (typeof patch.photoURL === 'string') authPatch.photoURL = patch.photoURL || null

    if (Object.keys(authPatch).length) {
      try {
        await firebaseUpdateProfile(authUser, authPatch)
      } catch (err) {
        console.warn('Firebase Auth profile update failed:', err?.message || err)
      }
    }
  }
}

export async function uploadProfilePhoto(uid, file) {
  const url = await uploadToCloudinary(file, 'avatars')
  await setDoc(doc(db, 'users', uid), { photoURL: url }, { merge: true })

  const authUser = auth.currentUser
  if (authUser?.uid === uid) {
    try {
      await firebaseUpdateProfile(authUser, { photoURL: url })
    } catch (err) {
      console.warn('Firebase Auth photo update failed:', err?.message || err)
    }
  }

  return url
}

export async function searchByUsername(username) {
  const trimmed = username.toLowerCase().trim()
  if (!trimmed) return []

  const q = query(
    collection(db, 'users'),
    orderBy('username'),
    startAt(trimmed),
    endAt(`${trimmed}\uf8ff`)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => withDefaults({ uid: d.id, ...d.data() }))
}

export async function completeSetup(uid, { displayName, username, bio, photoFile }) {
  const existingSnap = await getDoc(doc(db, 'users', uid))
  const existing = existingSnap.exists() ? existingSnap.data() : {}

  let photoURL = existing.photoURL || ''
  if (photoFile) {
    photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }

  const emailVerified = existing.emailVerified ?? auth.currentUser?.emailVerified ?? false
  const phoneVerified = existing.phoneVerified ?? false
  const phone = existing.phone ?? ''
  const createdAt = existing.createdAt || serverTimestamp()

  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      displayName: displayName.trim(),
      username: username.toLowerCase().trim(),
      bio: bio?.trim() ?? '',
      photoURL,
      emailVerified,
      phoneVerified,
      phone,
      status: 'offline',
      setupComplete: true,
      lastSeen: serverTimestamp(),
      createdAt,
      pinnedConvs: existing.pinnedConvs || [],
      mutedConvs: existing.mutedConvs || [],
      blockedUsers: existing.blockedUsers || [],
      privacy: existing.privacy ? sanitizePrivacy(existing.privacy) : DEFAULT_PRIVACY,
      notifications: existing.notifications ? sanitizeNotifications(existing.notifications) : DEFAULT_NOTIFICATIONS,
    },
    { merge: true }
  )

  const authUser = auth.currentUser
  if (authUser?.uid === uid) {
    try {
      await firebaseUpdateProfile(authUser, {
        displayName: displayName.trim(),
        photoURL: photoURL || null,
      })
    } catch (err) {
      console.warn('Firebase Auth setup profile update failed:', err?.message || err)
    }
  }
}