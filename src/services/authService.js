import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as firebaseUpdateProfile,
  deleteUser,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

// ── REGISTER ─────────────────────────────────────────────
export async function register({ displayName, email, password }) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)

  await firebaseUpdateProfile(user, { displayName: displayName.trim() })

  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: displayName.trim(),
    email: email.trim(),
    photoURL: '',
    username: '',
    bio: '',
    emailVerified: false,
    phoneVerified: false,
    phone: '',
    setupComplete: false,
    status: 'offline',
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp(),
    pinnedConvs: [],
    mutedConvs: [],
    blockedUsers: [],
  })

  try { await sendEmailVerification(user) } catch (_) {}

  return user
}

// ── LOGIN ─────────────────────────────────────────────────
export async function login({ email, password }) {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  return user
}

// ── GOOGLE ────────────────────────────────────────────────
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider()
  const { user } = await signInWithPopup(auth, provider)

  const snap = await getDoc(doc(db, 'users', user.uid))
  if (!snap.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      username: '',
      bio: '',
      emailVerified: true,
      phoneVerified: false,
      phone: '',
      setupComplete: false,
      status: 'offline',
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
      pinnedConvs: [],
      mutedConvs: [],
      blockedUsers: [],
    })
  }
  return user
}

// ── LOGOUT ────────────────────────────────────────────────
export async function logout() {
  await signOut(auth)
}

// ── PASSWORD RESET ────────────────────────────────────────
export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email)
}

// ── PHONE OTP ─────────────────────────────────────────────
export async function sendPhoneOTP(phoneNumber) {
  const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {},
  })
  const result = await linkWithPhoneNumber(auth.currentUser, phoneNumber, verifier)
  sessionStorage.setItem('otp_verificationId', result.verificationId)
  return result
}

export async function verifyPhoneOTP(code) {
  const verificationId = sessionStorage.getItem('otp_verificationId')
  if (!verificationId) throw new Error('Session expired. Please re-send OTP.')
  const credential = PhoneAuthProvider.credential(verificationId, code)
  await linkWithCredential(auth.currentUser, credential)
  sessionStorage.removeItem('otp_verificationId')
}

// ── DELETE ACCOUNT ────────────────────────────────────────
// Deletes ALL data associated with the user, then removes the
// Firebase Auth account itself.
//
// What gets cleaned up:
//   • friends/{uid}/list/*           – friend entries (sent & received)
//   • friends/*/list/{uid}           – reverse entries on OTHER users' lists
//     (done by iterating over the user's own list first to get peer UIDs)
//   • notifications/{uid}/items/*    – all notifications received
//   • notifications/*/items where fromUid == uid  — notifications the user
//     sent to others (friend_request etc.)
//   • conversations where user is a member/pending — user is removed;
//     if a private conv has no members left it is deleted entirely
//   • users/{uid}                    – the Firestore profile document
//   • Firebase Auth user             – the auth record
//
// NOTE: Conversations messages are NOT deleted on account deletion —
// only the user is removed from membership. If you want full message
// deletion add that here.
export async function deleteAccount() {
  const user = auth.currentUser
  if (!user) throw new Error('No authenticated user.')
  const uid = user.uid

  // ── 1. Gather friend UIDs so we can clean reverse entries ──
  let friendUids = []
  try {
    const friendsSnap = await getDocs(collection(db, 'friends', uid, 'list'))
    friendUids = friendsSnap.docs.map(d => d.id)

    // Delete all entries in the user's own friend list (in batches)
    const CHUNK = 450
    for (let i = 0; i < friendsSnap.docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      friendsSnap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  } catch (err) {
    console.warn('deleteAccount: could not clean friends list', err)
  }

  // ── 2. Remove this user from each friend's list ─────────────
  for (const friendUid of friendUids) {
    try {
      await deleteDoc(doc(db, 'friends', friendUid, 'list', uid))
    } catch (err) {
      console.warn(`deleteAccount: could not remove from friends/${friendUid}/list`, err)
    }
  }

  // ── 3. Delete all notifications received by this user ───────
  try {
    const notifsSnap = await getDocs(collection(db, 'notifications', uid, 'items'))
    const CHUNK = 450
    for (let i = 0; i < notifsSnap.docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      notifsSnap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  } catch (err) {
    console.warn('deleteAccount: could not clean received notifications', err)
  }

  // ── 4. Delete notifications this user sent to friends ───────
  // (friend_request notifications stored under the recipient)
  for (const friendUid of friendUids) {
    try {
      const q = query(
        collection(db, 'notifications', friendUid, 'items'),
        where('fromUid', '==', uid)
      )
      const snap = await getDocs(q)
      if (!snap.docs.length) continue
      const CHUNK = 450
      for (let i = 0; i < snap.docs.length; i += CHUNK) {
        const batch = writeBatch(db)
        snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
    } catch (err) {
      console.warn(`deleteAccount: could not clean sent notifs for ${friendUid}`, err)
    }
  }

  // ── 5. Remove user from all conversations ───────────────────
  try {
    // private convs
    const privateQ = query(
      collection(db, 'conversations'),
      where('members', 'array-contains', uid)
    )
    const privateSnap = await getDocs(privateQ)

    for (const convDoc of privateSnap.docs) {
      try {
        const convData = convDoc.data()
        const isPrivate = convData.type === 'private'
        const newMembers = (convData.members || []).filter(m => m !== uid)

        if (isPrivate || newMembers.length === 0) {
          // Delete messages sub-collection first
          const msgsSnap = await getDocs(
            collection(db, 'conversations', convDoc.id, 'messages')
          )
          const CHUNK = 450
          for (let i = 0; i < msgsSnap.docs.length; i += CHUNK) {
            const batch = writeBatch(db)
            msgsSnap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
            await batch.commit()
          }
          await deleteDoc(convDoc.ref)
        } else {
          // Group — just remove the user
          const { updateDoc, arrayRemove } = await import('firebase/firestore')
          await updateDoc(convDoc.ref, {
            members: arrayRemove(uid),
            admins: arrayRemove(uid),
          })
        }
      } catch (err) {
        console.warn(`deleteAccount: failed to clean conv ${convDoc.id}`, err)
      }
    }

    // pendingMembers convs (invited but not yet joined)
    const pendingQ = query(
      collection(db, 'conversations'),
      where('pendingMembers', 'array-contains', uid)
    )
    const pendingSnap = await getDocs(pendingQ)
    for (const convDoc of pendingSnap.docs) {
      try {
        const { updateDoc, arrayRemove } = await import('firebase/firestore')
        await updateDoc(convDoc.ref, { pendingMembers: arrayRemove(uid) })
      } catch (err) {
        console.warn(`deleteAccount: failed to remove from pending conv ${convDoc.id}`, err)
      }
    }
  } catch (err) {
    console.warn('deleteAccount: could not clean conversations', err)
  }

  // ── 6. Delete Firestore user document ───────────────────────
  try {
    await deleteDoc(doc(db, 'users', uid))
  } catch (err) {
    console.warn('deleteAccount: could not delete user doc', err)
  }

  // ── 7. Delete Firebase Auth user ────────────────────────────
  // This requires a recent sign-in. If it fails with
  // auth/requires-recent-login, re-authenticate first then call again.
  await deleteUser(user)
}