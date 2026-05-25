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
import { db } from '../lib/firebase'
import { uploadToCloudinary } from '../lib/cloudinary'

export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { uid, ...snap.data() } : null
}

export async function updateProfile(uid, data) {
  const { photoFile, ...rest } = data
  if (photoFile) {
    rest.photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }
  await setDoc(doc(db, 'users', uid), {
    ...rest,
    lastSeen: serverTimestamp(),
  }, { merge: true })
}

export async function uploadProfilePhoto(uid, file) {
  const url = await uploadToCloudinary(file, 'avatars')
  await setDoc(doc(db, 'users', uid), { photoURL: url }, { merge: true })
  return url
}

export async function searchByUsername(username) {
  const q = query(
    collection(db, 'users'),
    where('username', '==', username.toLowerCase().trim())
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
}

// Creates or completes the user doc in one single write.
// Called from SetupProfile — user is guaranteed authenticated here.
export async function completeSetup(uid, { displayName, username, bio, photoFile }) {
  let photoURL = ''
  if (photoFile) {
    photoURL = await uploadToCloudinary(photoFile, 'avatars')
  }
  await setDoc(doc(db, 'users', uid), {
    uid,
    displayName:   displayName.trim(),
    username:      username.toLowerCase().trim(),
    bio:           bio?.trim() ?? '',
    photoURL,
    emailVerified: false,
    phoneVerified: false,
    phone:         '',
    status:        'offline',
    setupComplete: true,
    lastSeen:      serverTimestamp(),
    createdAt:     serverTimestamp(),
    pinnedConvs:   [],
    mutedConvs:    [],
    blockedUsers:  [],
  }, { merge: true })
}
const newUserDefaults = {
  privacy: {
    profileVisible:   'everyone',
    showLastSeen:     true,
    showOnlineStatus: true,
    allowFriendReqs:  true,
    readReceipts:     true,
  },
  notifications: {
    messages:   true,
    mentions:   true,
    friendReqs: true,
    appUpdates: false,
    sound:      true,
  },
}