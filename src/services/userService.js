import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { updateProfile as firebaseUpdateProfile } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { uploadToCloudinary } from '../lib/cloudinary'

const DEFAULT_PRIVACY = {
  profileVisible: 'everyone',
  showLastSeen: true,
  showOnlineStatus: true,
  allowFriendReqs: true,
  readReceipts: true,
}

const DEFAULT_NOTIFICATIONS = {
  messages: true,
  mentions: true,
  friendReqs: true,
  appUpdates: false,
  sound: true,
}

function sanitizePrivacy(privacy = {}) {
  return {
    profileVisible: ['everyone', 'friends', 'nobody'].includes(privacy.profileVisible)
      ? privacy.profileVisible
      : DEFAULT_PRIVACY.profileVisible,
    showLastSeen: typeof privacy.showLastSeen === 'boolean' ? privacy.showLastSeen : DEFAULT_PRIVACY.showLastSeen,
    showOnlineStatus: typeof privacy.showOnlineStatus === 'boolean' ? privacy.showOnlineStatus : DEFAULT_PRIVACY.showOnlineStatus,
    allowFriendReqs: typeof privacy.allowFriendReqs === 'boolean' ? privacy.allowFriendReqs : DEFAULT_PRIVACY.allowFriendReqs,
    readReceipts: typeof privacy.readReceipts === 'boolean' ? privacy.readReceipts : DEFAULT_PRIVACY.readReceipts,
  }
}

function sanitizeNotifications(notifications = {}) {
  return {
    messages: typeof notifications.messages === 'boolean' ? notifications.messages : DEFAULT_NOTIFICATIONS.messages,
    mentions: typeof notifications.mentions === 'boolean' ? notifications.mentions : DEFAULT_NOTIFICATIONS.mentions,
    friendReqs: typeof notifications.friendReqs === 'boolean' ? notifications.friendReqs : DEFAULT_NOTIFICATIONS.friendReqs,
    appUpdates: typeof notifications.appUpdates === 'boolean' ? notifications.appUpdates : DEFAULT_NOTIFICATIONS.appUpdates,
    sound: typeof notifications.sound === 'boolean' ? notifications.sound : DEFAULT_NOTIFICATIONS.sound,
  }
}

function withDefaults(userData = {}) {
  return {
    ...userData,
    privacy: sanitizePrivacy(userData.privacy || {}),
    notifications: sanitizeNotifications(userData.notifications || {}),
  }
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? withDefaults({ uid, ...snap.data() }) : null
}

export async function updateProfile(uid, data) {
  const { photoFile, privacy, notifications, ...rest } = data
  const authUser = auth.currentUser

  if (photoFile) {
    rest.photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }

  const patch = {
    ...rest,
    lastSeen: serverTimestamp(),
  }

  if (privacy) patch.privacy = sanitizePrivacy(privacy)
  if (notifications) patch.notifications = sanitizeNotifications(notifications)

  await setDoc(doc(db, 'users', uid), patch, { merge: true })

  if (authUser?.uid === uid) {
    const authPatch = {}
    if (typeof rest.displayName === 'string') authPatch.displayName = rest.displayName
    if (typeof rest.photoURL === 'string') authPatch.photoURL = rest.photoURL || null

    if (Object.keys(authPatch).length) {
      try {
        await firebaseUpdateProfile(authUser, authPatch)
      } catch (err) {
        console.warn('Firebase auth profile update failed:', err?.message || err)
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
      console.warn('Firebase auth photo update failed:', err?.message || err)
    }
  }

  return url
}

export async function searchByUsername(username) {
  const q = query(
    collection(db, 'users'),
    where('username', '==', username.toLowerCase().trim())
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => withDefaults({ uid: d.id, ...d.data() }))
}

// Creates or completes the user doc in one single write.
// Called from SetupProfile — user is guaranteed authenticated here.
export async function completeSetup(uid, { displayName, username, bio, photoFile }) {
  let photoURL = ''
  if (photoFile) {
    photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }

  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      displayName: displayName.trim(),
      username: username.toLowerCase().trim(),
      bio: bio?.trim() ?? '',
      photoURL,
      emailVerified: false,
      phoneVerified: false,
      phone: '',
      status: 'offline',
      setupComplete: true,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
      pinnedConvs: [],
      mutedConvs: [],
      blockedUsers: [],
      privacy: DEFAULT_PRIVACY,
      notifications: DEFAULT_NOTIFICATIONS,
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
      console.warn('Firebase auth setup profile update failed:', err?.message || err)
    }
  }
}