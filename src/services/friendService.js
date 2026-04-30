// src/services/friendService.js
import {
  doc, setDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot,
  serverTimestamp, arrayUnion, getDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { sendNotification } from './notificationService'

// ── SEND FRIEND REQUEST ───────────────────────────────────
export async function sendFriendRequest(myUid, theirUid) {
  const existingSnap = await getDoc(doc(db, 'friends', myUid, 'list', theirUid))
  if (existingSnap.exists()) {
    const data = existingSnap.data()
    if (data.status === 'accepted') throw new Error('Already friends!')
    if (data.status === 'pending')  throw new Error('Request already sent!')
  }
  
  // Get sender's profile
  const myProfile = await getDoc(doc(db, 'users', myUid))
  const myData = myProfile.data() || {}
  
  await setDoc(doc(db, 'friends', myUid, 'list', theirUid), {
    uid: theirUid, status: 'pending', direction: 'sent', addedAt: serverTimestamp(),
  })
  await setDoc(doc(db, 'friends', theirUid, 'list', myUid), {
    uid: myUid, status: 'pending', direction: 'received', addedAt: serverTimestamp(),
  })
  
  // Send notification to recipient
  await sendNotification(theirUid, {
    type: 'friend_request',
    title: `${myData.displayName || 'Someone'} sent you a friend request`,
    body: 'Tap to view your friend requests',
    fromUid: myUid,
    fromName: myData.displayName || 'Unknown',
    fromPhoto: myData.photoURL || '',
  }).catch(err => console.error('Failed to send friend request notification:', err))
}

// ── CANCEL SENT REQUEST ───────────────────────────────────
export async function cancelFriendRequest(myUid, theirUid) {
  await deleteDoc(doc(db, 'friends', myUid, 'list', theirUid))
  await deleteDoc(doc(db, 'friends', theirUid, 'list', myUid))
}

// ── ACCEPT FRIEND REQUEST ─────────────────────────────────
export async function acceptFriendRequest(myUid, theirUid) {
  await updateDoc(doc(db, 'friends', myUid, 'list', theirUid), { status: 'accepted' })
  await updateDoc(doc(db, 'friends', theirUid, 'list', myUid), { status: 'accepted' })
}

// ── DECLINE FRIEND REQUEST ────────────────────────────────
export async function declineFriendRequest(myUid, theirUid) {
  await deleteDoc(doc(db, 'friends', myUid, 'list', theirUid))
  await deleteDoc(doc(db, 'friends', theirUid, 'list', myUid))
}

// ── BLOCK USER ────────────────────────────────────────────
export async function blockUser(myUid, theirUid) {
  await deleteDoc(doc(db, 'friends', myUid, 'list', theirUid))
  await deleteDoc(doc(db, 'friends', theirUid, 'list', myUid))
  await updateDoc(doc(db, 'users', myUid), { blockedUsers: arrayUnion(theirUid) })
}

// ── WATCH FRIENDS (accepted) ──────────────────────────────
export function watchFriends(uid, callback) {
  const q = query(
    collection(db, 'friends', uid, 'list'),
    where('status', '==', 'accepted')
  )
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.warn('watchFriends:', err.message)
  )
}

// ── WATCH REQUESTS (all pending) ──────────────────────────
export function watchRequests(uid, callback) {
  const q = query(
    collection(db, 'friends', uid, 'list'),
    where('status', '==', 'pending')
  )
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.warn('watchRequests:', err.message)
  )
}

// ── GET FULL USER PROFILES FOR FRIEND LIST ────────────────
export async function getFriendProfiles(friendDocs) {
  const { getDoc, doc: firestoreDoc } = await import('firebase/firestore')
  const { db: firestoreDb } = await import('../lib/firebase')
  const profiles = await Promise.all(
    friendDocs.map(async f => {
      try {
        const snap = await getDoc(firestoreDoc(firestoreDb, 'users', f.uid))
        return snap.exists() ? { ...f, ...snap.data() } : f
      } catch {
        return f
      }
    })
  )
  return profiles
}