// src/services/chatService.js
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { uploadToCloudinary } from '../lib/cloudinary'
import { getUser } from './userService'
import {
  sendNotification,
  scheduleMessageNotif,
  cancelAllConvNotifs,
} from './notificationService'

// ── Create or get private conversation ───────────────────────────────────────
export async function createPrivateConv(uid1, uid2, names = {}, photos = {}) {
  const sorted = [uid1, uid2].sort()
  const convId = `private_${sorted[0]}_${sorted[1]}`
  const convRef = doc(db, 'conversations', convId)

  await setDoc(
    convRef,
    {
      type: 'private',
      members: [uid1, uid2],
      memberNames: names,
      memberPhotos: photos,
      admins: [],
      groupName: '',
      groupPhoto: '',
      createdBy: uid1,
      createdAt: serverTimestamp(),
      pinnedBy: [],
      mutedBy: [],
      pendingMembers: [],
      lastMessage: { text: '', senderId: '', timestamp: null, type: 'text' },
      unreadCount: { [uid1]: 0, [uid2]: 0 },
    },
    { merge: true }
  )

  return convId
}

// ── Create group conversation ─────────────────────────────────────────────────
// Creator is the only immediate member — others get an invite notification.
export async function createGroupConv(creatorUid, groupName, memberUids, names = {}, photos = {}) {
  const convRef = doc(collection(db, 'conversations'))

  await setDoc(convRef, {
    type: 'group',
    members: [creatorUid],
    pendingMembers: memberUids,
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

  const creatorName = names[creatorUid] || 'Someone'
  const creatorPhoto = photos[creatorUid] || ''

  const inviteTasks = memberUids.map(uid =>
    sendNotification(uid, {
      type: 'group_invite',
      title: `${creatorName} invited you to a group`,
      body: `Join "${groupName}"`,
      fromUid: creatorUid,
      fromName: creatorName,
      fromPhoto: creatorPhoto,
      convId: convRef.id,
      groupName,
    }).catch(err => console.error(`Group invite notif failed for ${uid}:`, err))
  )

  await Promise.allSettled(inviteTasks)
  return convRef.id
}

// ── Invite more members to an existing group ──────────────────────────────────
export async function inviteGroupMembers(convId, inviterUid, memberUids, names = {}, photos = {}) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()

  if (!convData) throw new Error('Group not found')
  if (convData.type !== 'group') throw new Error('Not a group chat')

  const currentMembers = convData.members || []
  const currentPending = convData.pendingMembers || []

  const cleanedUids = [...new Set(memberUids)].filter(
    uid => uid && !currentMembers.includes(uid) && !currentPending.includes(uid)
  )

  if (!cleanedUids.length) return

  const inviterName = convData.memberNames?.[inviterUid] || 'Someone'
  const inviterPhoto = convData.memberPhotos?.[inviterUid] || ''

  await updateDoc(convRef, {
    pendingMembers: arrayUnion(...cleanedUids),
    memberNames: { ...(convData.memberNames || {}), ...names },
    memberPhotos: { ...(convData.memberPhotos || {}), ...photos },
  })

  for (const uid of cleanedUids) {
    try {
      const notifsSnap = await getDocs(
        query(
          collection(db, 'notifications', uid, 'items'),
          where('type', '==', 'group_invite'),
          where('fromUid', '==', inviterUid),
          where('convId', '==', convId)
        )
      )

      if (notifsSnap.docs.length > 0) {
        await updateDoc(doc(db, 'notifications', uid, 'items', notifsSnap.docs[0].id), {
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
          reminded: true,
        }).catch(() => {})
      } else {
        await sendNotification(uid, {
          type: 'group_invite',
          title: `${inviterName} invited you to a group`,
          body: `Join "${convData.groupName || 'this group'}"`,
          fromUid: inviterUid,
          fromName: inviterName,
          fromPhoto: inviterPhoto,
          convId,
          groupName: convData.groupName || '',
        }).catch(console.error)
      }
    } catch (err) {
      console.error(`Failed to handle group invite for ${uid}:`, err)
      await sendNotification(uid, {
        type: 'group_invite',
        title: `${inviterName} invited you to a group`,
        body: `Join "${convData.groupName || 'this group'}"`,
        fromUid: inviterUid,
        fromName: inviterName,
        fromPhoto: inviterPhoto,
        convId,
        groupName: convData.groupName || '',
      }).catch(console.error)
    }
  }
}

// ── Internal: batch-delete all messages in a conversation ─────────────────────
async function _deleteMessagesInBatches(convId) {
  const msgsSnap = await getDocs(collection(db, 'conversations', convId, 'messages'))
  const docs = msgsSnap.docs
  if (!docs.length) return

  const CHUNK = 450
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db)
    docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

// ── Delete an entire group conversation ───────────────────────────────────────
export async function deleteGroupConversation(convId) {
  cancelAllConvNotifs(convId)

  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  if (!convSnap.exists()) return

  await _deleteMessagesInBatches(convId)
  await deleteDoc(convRef)
}

// ── Accept group invite ───────────────────────────────────────────────────────
export async function acceptGroupInvite(convId, uid) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()

  if (!convData) throw new Error('Group not found')
  if (!convData.pendingMembers?.includes(uid)) throw new Error('No pending invite')

  await updateDoc(convRef, {
    members: arrayUnion(uid),
    pendingMembers: arrayRemove(uid),
    [`unreadCount.${uid}`]: 0,
  })

  const userName = convData.memberNames?.[uid] || 'Someone'
  await _sendSystemMessage(convId, `${userName} joined the group`)
}

// ── Decline group invite ──────────────────────────────────────────────────────
export async function declineGroupInvite(convId, uid) {
  await updateDoc(doc(db, 'conversations', convId), {
    pendingMembers: arrayRemove(uid),
  })
}

// ── Leave group ───────────────────────────────────────────────────────────────
export async function leaveGroup(convId, uid) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()

  if (!convData) throw new Error('Group not found')

  const newMembers = (convData.members || []).filter(m => m !== uid)
  const newPending = (convData.pendingMembers || []).filter(m => m !== uid)
  const newAdmins = (convData.admins || []).filter(a => a !== uid)

  if (!newMembers.length) {
    await deleteGroupConversation(convId)
    return
  }

  await updateDoc(convRef, { members: newMembers, pendingMembers: newPending, admins: newAdmins })

  const userName = convData.memberNames?.[uid] || 'Someone'
  await _sendSystemMessage(convId, `${userName} left the group`)
}

// ── Remove a member from a group ──────────────────────────────────────────────
export async function removeGroupMember(convId, targetUid) {
  const convRef = doc(db, 'conversations', convId)
  const convSnap = await getDoc(convRef)
  const convData = convSnap.data()

  if (!convData) throw new Error('Group not found')

  const newMembers = (convData.members || []).filter(m => m !== targetUid)
  const newPending = (convData.pendingMembers || []).filter(m => m !== targetUid)
  const newAdmins = (convData.admins || []).filter(a => a !== targetUid)

  if (!newMembers.length) {
    await deleteGroupConversation(convId)
    return
  }

  await updateDoc(convRef, { members: newMembers, pendingMembers: newPending, admins: newAdmins })

  const userName = convData.memberNames?.[targetUid] || 'Someone'
  await _sendSystemMessage(convId, `${userName} was removed from the group`)
}

// ── Internal: post a system message ──────────────────────────────────────────
async function _sendSystemMessage(convId, text) {
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  await setDoc(msgRef, {
    senderId: 'system',
    type: 'system',
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

// Public helper: send a system-style message into a conversation
// options: { eventType, actorUid, callType, metadata }
export async function sendSystemMessage(convId, text, options = {}) {
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  const payload = {
    senderId: 'system',
    type: 'system',
    text,
    reactions: {},
    readBy: [],
    deliveredTo: [],
    deletedFor: [],
    unsent: false,
    createdAt: serverTimestamp(),
    editedAt: null,
  }

  if (options.eventType) payload.eventType = options.eventType
  if (options.actorUid) payload.actorUid = options.actorUid
  if (options.callType) payload.callType = options.callType
  if (options.metadata) payload.metadata = options.metadata

  await setDoc(msgRef, payload)
  return msgRef.id
}

// ── Send a message ────────────────────────────────────────────────────────────
export async function sendMessage(convId, {
  senderId,
  text = '',
  type = 'text',
  fileURL = null,
  fileName = null,
  fileSize = null,
  replyTo = null,
}) {
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  await setDoc(msgRef, {
    senderId,
    type,
    text,
    fileURL,
    fileName,
    fileSize,
    replyTo,
    reactions: {},
    readBy: [senderId],
    deliveredTo: [senderId],
    deletedFor: [],
    unsent: false,
    createdAt: serverTimestamp(),
    editedAt: null,
  })

  const convSnap = await getDoc(doc(db, 'conversations', convId))
  const convData = convSnap.data()
  const members = convData?.members || []
  const isGroup = convData?.type === 'group'

  const unreadUpdates = {}
  members.forEach(uid => {
    unreadUpdates[`unreadCount.${uid}`] = uid === senderId ? 0 : increment(1)
  })

  const preview = text || (
    type === 'image' ? '📷 Photo' :
    type === 'video' ? '🎥 Video' :
    '📎 File'
  )

  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: { text: preview, senderId, timestamp: serverTimestamp(), type },
    ...unreadUpdates,
  })

  const senderName = convData?.memberNames?.[senderId] || 'Someone'
  const senderPhoto = convData?.memberPhotos?.[senderId] || ''
  const groupName = convData?.groupName || ''

  members.forEach(uid => {
    if (uid === senderId) return
    scheduleMessageNotif(uid, {
      fromUid: senderId,
      fromName: senderName,
      fromPhoto: senderPhoto,
      convId,
      messageId: msgRef.id,
      preview,
      isGroup,
      groupName,
      messageType: type,
    })
  })

  return msgRef.id
}

// ── Upload a file via Cloudinary ──────────────────────────────────────────────
export async function uploadFile(file, convId) {
  const url = await uploadToCloudinary(file, `messages/${convId}`)
  return { url, name: file.name, size: file.size }
}

// ── Send a group announcement ─────────────────────────────────────────────────
export async function sendAnnouncement(convId, senderUid, text, convData) {
  if (!convData || convData.type !== 'group') {
    throw new Error('Announcements only work in groups')
  }

  const msgRef = doc(collection(db, 'conversations', convId, 'messages'))
  await setDoc(msgRef, {
    id: msgRef.id,
    convId,
    senderId: senderUid,
    text,
    type: 'announce',
    fileURL: null,
    fileName: null,
    fileType: null,
    reactions: {},
    replyTo: null,
    deliveredTo: [senderUid],
    readBy: [senderUid],
    unsent: false,
    deletedFor: [],
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  })

  const senderName = convData.memberNames?.[senderUid] || 'Someone'
  const senderPhoto = convData.memberPhotos?.[senderUid] || ''
  const allMembers = [
    ...new Set([...(convData.members || []), ...(convData.pendingMembers || [])]),
  ].filter(uid => uid !== senderUid)

  for (const uid of allMembers) {
    await sendNotification(uid, {
      type: 'announce',
      title: `Announcement in ${convData.groupName || 'a group'}`,
      body: text.slice(0, 60),
      fromUid: senderUid,
      fromName: senderName,
      fromPhoto: senderPhoto,
      convId,
      groupName: convData.groupName || '',
    }).catch(console.error)
  }

  return msgRef.id
}

// ── Send a mention notification ───────────────────────────────────────────────
export async function sendMentionNotif(convId, senderUid, mentionedUid, text, convData) {
  if (mentionedUid === senderUid) return

  const senderName = convData?.memberNames?.[senderUid] || 'Someone'
  const senderPhoto = convData?.memberPhotos?.[senderUid] || ''
  const isGroup = convData?.type === 'group'

  await sendNotification(mentionedUid, {
    type: 'mention',
    title: `${senderName} mentioned you`,
    body: text.slice(0, 60),
    fromUid: senderUid,
    fromName: senderName,
    fromPhoto: senderPhoto,
    convId,
    groupName: isGroup ? convData.groupName : null,
  }).catch(console.error)
}

// ── Mark messages as DELIVERED ────────────────────────────────────────────────
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

// ── Mark messages as SEEN ─────────────────────────────────────────────────────
export async function markSeen(convId, uid, messages) {
  if (!Array.isArray(messages) || !messages.length) return

  const viewer = await getUser(uid).catch(() => null)
  const allowReceipts = viewer?.privacy?.readReceipts !== false

  const unseen = messages.filter(
    m => m.senderId !== uid && !m.readBy?.includes(uid)
  )
  if (!unseen.length) return

  cancelAllConvNotifs(convId)

  try {
    const batch = writeBatch(db)
    unseen.forEach(m => {
      batch.update(doc(db, 'conversations', convId, 'messages', m.id), {
        deliveredTo: arrayUnion(uid),
        ...(allowReceipts ? { readBy: arrayUnion(uid) } : {}),
      })
    })
    await batch.commit()

    await updateDoc(doc(db, 'conversations', convId), {
      [`unreadCount.${uid}`]: 0,
    })
  } catch (err) {
    console.error('markSeen error:', err)
  }
}

// ── Legacy: mark conversation read ───────────────────────────────────────────
export async function markRead(convId, uid) {
  cancelAllConvNotifs(convId)
  await updateDoc(doc(db, 'conversations', convId), {
    [`unreadCount.${uid}`]: 0,
  })
}

// ── Add a reaction ────────────────────────────────────────────────────────────
export async function addReaction(convId, msgId, uid, emoji) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`reactions.${emoji}`]: arrayUnion(uid),
  })

  try {
    const msgSnap = await getDoc(doc(db, 'conversations', convId, 'messages', msgId))
    const msgData = msgSnap.data()
    const ownerId = msgData?.senderId
    if (!ownerId || ownerId === uid || ownerId === 'system') return

    const convSnap = await getDoc(doc(db, 'conversations', convId))
    const convData = convSnap.data()
    const isGroup = convData?.type === 'group'

    const reactorName = convData?.memberNames?.[uid] || 'Someone'
    const reactorPhoto = convData?.memberPhotos?.[uid] || ''
    const preview = msgData.text || (
      msgData.type === 'image' ? 'a photo' :
      msgData.type === 'video' ? 'a video' :
      'a file'
    )

    await sendNotification(ownerId, {
      type: 'reaction',
      title: isGroup ? convData.groupName : reactorName,
      body: `${reactorName} reacted ${emoji} to: "${preview.slice(0, 40)}"`,
      fromUid: uid,
      fromName: reactorName,
      fromPhoto: reactorPhoto,
      convId,
      emoji,
      groupName: isGroup ? convData.groupName : null,
    })
  } catch (err) {
    console.error('addReaction notif error:', err)
  }
}

// ── Remove a reaction ─────────────────────────────────────────────────────────
export async function removeReaction(convId, msgId, uid, emoji) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    [`reactions.${emoji}`]: arrayRemove(uid),
  })
}

// ── Soft-delete a message (hide for one user) ─────────────────────────────────
export async function softDeleteMessage(convId, msgId, uid) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    deletedFor: arrayUnion(uid),
  })
}

// ── Unsend a message (delete for everyone) ────────────────────────────────────
export async function unsendMessage(convId, msgId) {
  await updateDoc(doc(db, 'conversations', convId, 'messages', msgId), {
    unsent: true,
    text: '',
    fileURL: null,
    fileName: null,
  })
}

// ── Update group info ─────────────────────────────────────────────────────────
export async function updateGroupInfo(convId, data) {
  await updateDoc(doc(db, 'conversations', convId), { ...data })
}

// ── Toggle pin ────────────────────────────────────────────────────────────────
export async function togglePin(convId, uid, pin) {
  await updateDoc(doc(db, 'conversations', convId), {
    pinnedBy: pin ? arrayUnion(uid) : arrayRemove(uid),
  })
}

// ── Toggle mute ───────────────────────────────────────────────────────────────
export async function toggleMute(convId, uid, mute) {
  await updateDoc(doc(db, 'conversations', convId), {
    mutedBy: mute ? arrayUnion(uid) : arrayRemove(uid),
  })
}

// ── Watch all conversations for a user ────────────────────────────────────────
export function watchConversations(uid, callback) {
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', uid)
  )

  return onSnapshot(
    q,
    snap => {
      const convos = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aPinned = a.pinnedBy?.includes(uid) ? 1 : 0
          const bPinned = b.pinnedBy?.includes(uid) ? 1 : 0
          if (bPinned !== aPinned) return bPinned - aPinned

          const ta = a.lastMessage?.timestamp?.seconds ?? a.createdAt?.seconds ?? 0
          const tb = b.lastMessage?.timestamp?.seconds ?? b.createdAt?.seconds ?? 0
          return tb - ta
        })
      callback(convos)
    },
    err => console.warn('watchConversations:', err.message)
  )
}

// ── Watch messages in a conversation ──────────────────────────────────────────
export function watchMessages(convId, callback) {
  if (!convId) return () => {}

  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(50)
  )

  return onSnapshot(
    q,
    snap => {
      const messages = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .reverse()
      callback(messages)
    },
    err => console.warn('watchMessages:', err.message)
  )
}

// ── Get a single conversation ─────────────────────────────────────────────────
export async function getConversation(convId) {
  if (!convId) return null
  const snap = await getDoc(doc(db, 'conversations', convId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}