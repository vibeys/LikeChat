// src/services/chatService.js
import {
  collection, doc, setDoc, updateDoc, getDoc, writeBatch,
  onSnapshot, query, where, orderBy, limit,
  serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { uploadToCloudinary } from '../lib/cloudinary'
import { sendNotification } from './notificationService'

// ── Create or get private conversation ───────────────────
export async function createPrivateConv(uid1, uid2, names = {}, photos = {}) {
  const sorted  = [uid1, uid2].sort()
  const convId  = `private_${sorted[0]}_${sorted[1]}`
  const convRef = doc(db, 'conversations', convId)
  await setDoc(convRef, {
    type: 'private', members: [uid1, uid2],
    memberNames: names, memberPhotos: photos,
    admins: [], groupName: '', groupPhoto: '',
    createdBy: uid1, createdAt: serverTimestamp(),
    pinnedBy: [], mutedBy: [],
    lastMessage: { text: '', senderId: '', timestamp: null, type: 'text' },
    unreadCount: { [uid1]: 0, [uid2]: 0 },
  }, { merge: true })
  return convId
}

// ── Create group conversation ─────────────────────────────
export async function createGroupConv(creatorUid, groupName, memberUids, names = {}, photos = {}) {
  // Only add creator initially - members need to accept invite
  const convRef = doc(collection(db, 'conversations'))
  await setDoc(convRef, {
    type: 'group', members: [creatorUid],
    pendingMembers: memberUids, // Members pending acceptance
    memberNames: { ...names }, 
    memberPhotos: { ...photos },
    admins: [creatorUid], 
    groupName, 
    groupPhoto: '',
    createdBy: creatorUid, 
    createdAt: serverTimestamp(),
    pinnedBy: [], 
    mutedBy: [],
    lastMessage: { text: '', senderId: '', timestamp: null, type: 'text' },
    unreadCount: { [creatorUid]: 0 },
  })
  
  // Send INVITE notifications (not auto-add)
  memberUids.forEach(uid => {
    sendNotification(uid, {
      type: 'group_invite',
      title: `${names[creatorUid] || 'Someone'} invited you to a group`,
      body: `Join "${groupName}"`,
      fromUid: creatorUid,
      fromName: names[creatorUid] || 'Unknown',
      fromPhoto: photos[creatorUid] || '',
      convId: convRef.id,
      groupName,
    }).catch(err => console.error('Failed to send group notification:', err))
  })
  
  return convRef.id
}

// ── Accept group invite ────────────────────────────────────
export async function acceptGroupInvite(convId, uid) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()
  
  if (!convData) throw new Error('Group not found')
  if (!convData.pendingMembers?.includes(uid)) throw new Error('No pending invite')
  
  // Add user to members and remove from pending
  await updateDoc(convRef, {
    members: arrayUnion(uid),
    pendingMembers: arrayRemove(uid),
    [`unreadCount.${uid}`]: 0,
  })
  
  // Create system message
  const userName = convData.memberNames?.[uid] || 'Someone'
  await sendSystemMessage(convId, `${userName} joined the group`, 'member_joined')
}

// ── Ignore/decline group invite ────────────────────────────
export async function declineGroupInvite(convId, uid) {
  const convRef = doc(db, 'conversations', convId)
  await updateDoc(convRef, {
    pendingMembers: arrayRemove(uid),
  })
}

// ── Leave group ────────────────────────────────────────────
export async function leaveGroup(convId, uid) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()
  
  if (!convData) throw new Error('Group not found')
  
  // Remove user from members
  await updateDoc(convRef, {
    members: arrayRemove(uid),
  })
  
  // Create system message
  const userName = convData.memberNames?.[uid] || 'Someone'
  await sendSystemMessage(convId, `${userName} left the group`, 'member_left')
}

// ── Send system message ────────────────────────────────────
async function sendSystemMessage(convId, text, type = 'system') {
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  await setDoc(msgRef, {
    senderId: 'system',
    type,
    text,
    reactions: {},
    readBy: [],
    deliveredTo: [],
    deletedFor: [],
    unsent: false,
    createdAt: serverTimestamp(),
    editedAt: null,
  })
}

// ── Send message ──────────────────────────────────────────
export async function sendMessage(convId, {
  senderId, text = '', type = 'text',
  fileURL = null, fileName = null, fileSize = null, replyTo = null,
}) {
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  await setDoc(msgRef, {
    senderId, type, text, fileURL, fileName, fileSize, replyTo,
    reactions: {},
    // Status tracking:
    // readBy    = array of uids who have SEEN this message
    // deliveredTo = array of uids who have RECEIVED/opened the chat
    readBy:      [senderId],
    deliveredTo: [senderId],
    deletedFor:  [],
    unsent:      false,
    createdAt:   serverTimestamp(),
    editedAt:    null,
  })
  
  // Get conversation to know all members
  const convDoc = await getDoc(doc(db, 'conversations', convId))
  const convData = convDoc.data()
  const members = convData?.members || []
  const isGroup = convData?.type === 'group'
  
  // Increment unread count for all other members
  const unreadUpdates = {}
  members.forEach(uid => {
    if (uid === senderId) {
      unreadUpdates[`unreadCount.${uid}`] = 0
    } else {
      // Increment unread count for other members
      unreadUpdates[`unreadCount.${uid}`] = (convData.unreadCount?.[uid] || 0) + 1
    }
  })
  
  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: {
      text:      text || (type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File'),
      senderId, timestamp: serverTimestamp(), type,
    },
    ...unreadUpdates,
  })
  
  // Send notifications to all other members
  const senderName = convData?.memberNames?.[senderId] || 'Someone'
  const senderPhoto = convData?.memberPhotos?.[senderId] || ''
  const messagePreview = text || (type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File')
  
  members.forEach(uid => {
    if (uid !== senderId) {
      const chatName = isGroup ? convData?.groupName : senderName
      sendNotification(uid, {
        type: 'message',
        title: chatName,
        body: messagePreview,
        fromUid: senderId,
        fromName: senderName,
        fromPhoto: senderPhoto,
        convId,
      }).catch(err => console.error('Failed to send message notification:', err))
    }
  })
  
  return msgRef.id
}

// ── Upload file ───────────────────────────────────────────
export async function uploadFile(file, convId) {
  const url = await uploadToCloudinary(file, `messages/${convId}`)
  return { url, name: file.name, size: file.size }
}

// ── Mark all messages as DELIVERED (user opened the chat) ─
// Called when ChatWindow mounts — marks all unread messages as delivered
export async function markDelivered(convId, uid, messages) {
  const undelivered = messages.filter(
    m => m.senderId !== uid && !m.deliveredTo?.includes(uid)
  )
  if (!undelivered.length) return
  const batch = writeBatch(db)
  undelivered.forEach(m => {
    batch.update(doc(db, 'conversations', convId, 'messages', m.id), {
      deliveredTo: arrayUnion(uid),
    })
  })
  await batch.commit()
}

// ── Mark all messages as SEEN (user is looking at the chat) ─
// Called when user scrolls to bottom or chat is in focus
export async function markSeen(convId, uid, messages) {
  if (!Array.isArray(messages) || !messages.length) return
  
  const unseen = messages.filter(
    m => m.senderId !== uid && !m.readBy?.includes(uid)
  )
  
  if (!unseen.length) return
  
  try {
    const batch = writeBatch(db)
    unseen.forEach(m => {
      batch.update(doc(db, 'conversations', convId, 'messages', m.id), {
        readBy: arrayUnion(uid),
        deliveredTo: arrayUnion(uid),
      })
    })
    await batch.commit()
    
    // Reset unread count
    await updateDoc(doc(db, 'conversations', convId), {
      [`unreadCount.${uid}`]: 0,
    })
  } catch (err) {
    console.error('Failed to mark messages as seen:', err)
    throw err
  }
}

// ── Legacy markRead (kept for compatibility) ──────────────
export async function markRead(convId, uid) {
  await updateDoc(doc(db, 'conversations', convId), {
    [`unreadCount.${uid}`]: 0,
  })
}

// ── Reactions ─────────────────────────────────────────────
export async function addReaction(convId, msgId, uid, emoji) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`reactions.${emoji}`]: arrayUnion(uid),
  })
}

export async function removeReaction(convId, msgId, uid, emoji) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`reactions.${emoji}`]: arrayRemove(uid),
  })
}

// ── Soft delete (delete for me) ───────────────────────────
export async function softDeleteMessage(convId, msgId, uid) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    deletedFor: arrayUnion(uid),
  })
}

// ── Unsend (delete for everyone) ──────────────────────────
export async function unsendMessage(convId, msgId) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    unsent: true, text: '', fileURL: null, fileName: null,
  })
}

// ── Update group info ─────────────────────────────────────
export async function updateGroupInfo(convId, data) {
  await updateDoc(doc(db, 'conversations', convId), { ...data })
}

// ── Pin / unpin ───────────────────────────────────────────
export async function togglePin(convId, uid, pin) {
  await updateDoc(doc(db, 'conversations', convId), {
    pinnedBy: pin ? arrayUnion(uid) : arrayRemove(uid),
  })
}

// ── Mute / unmute ─────────────────────────────────────────
export async function toggleMute(convId, uid, mute) {
  await updateDoc(doc(db, 'conversations', convId), {
    mutedBy: mute ? arrayUnion(uid) : arrayRemove(uid),
  })
}

// ── Watch conversations ───────────────────────────────────
export function watchConversations(uid, callback) {
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', uid)
  )
  return onSnapshot(q,
    snap => {
      const convos = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.lastMessage?.timestamp?.seconds ?? 0
          const tb = b.lastMessage?.timestamp?.seconds ?? 0
          return tb - ta
        })
      callback(convos)
    },
    err => console.warn('watchConversations:', err.message)
  )
}

// ── Watch messages ────────────────────────────────────────
export function watchMessages(convId, callback) {
  if (!convId) return () => {}
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  )
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.warn('watchMessages:', err.message)
  )
}

// ── Get single conversation ───────────────────────────────
export async function getConversation(convId) {
  if (!convId) return null
  const snap = await getDoc(doc(db, 'conversations', convId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}