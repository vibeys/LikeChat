// src/pages/app/ChatWindow.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import {
  watchMessages, getConversation, markSeen,
  toggleMute, togglePin, sendAnnouncement,
  sendMentionNotif, updateGroupInfo, leaveGroup,
  removeGroupMember, softDeleteMessage,
} from '../../services/chatService'
import {
    startCall as initiateCall,
  watchIncomingCalls,
  declineCall,
  markCallMissed,
  acceptCall,
} from '../../services/callService'
import {
  sendCallNotification,
  sendMissedCallNotification,
  markNotificationRead,
} from '../../services/notificationService'
import { watchUserPresence } from '../../lib/presence'
import { canShowOnlineStatus, canShowLastSeen } from '../../services/settingsService'
import { useTyping } from '../../lib/typing'
import MessageBubble from '../../components/MessageBubble'
import MessageInput from '../../components/MessageInput'
import TypingIndicator from '../../components/TypingIndicator'
import CallScreen, { IncomingCallToast } from '../../components/CallScreen'
import { getInitials, getAvatarColor, formatDate } from '../../lib/utils'
import {
  arrayRemove, arrayUnion, doc, updateDoc, getDoc, deleteDoc, collection, getDocs, onSnapshot,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
    ArrowLeft, MagnifyingGlass, X, Bell, BellSlash, PushPin, PushPinSlash,
  Prohibit, PencilSimple, Trash, SignOut, Megaphone, At,
  Users, Gear, CaretRight, Check, ShieldCheck, Info,
  SpeakerHigh, SpeakerSlash, UserMinus, Crown, Plus, Camera,
  ChatCircle,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'Offline'
  const date = typeof lastSeen === 'number' ? new Date(lastSeen) : lastSeen?.toDate?.() ?? new Date(lastSeen)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatDate(date)
}

function groupByDate(msgs) {
  const groups = []
  let lastDate = null
  msgs.forEach(msg => {
    const d = msg.createdAt?.toDate?.()
    const dateStr = d ? formatDate(d) : null
    if (dateStr && dateStr !== lastDate) {
      groups.push({ type: 'divider', label: dateStr, id: `div-${dateStr}` })
      lastDate = dateStr
    }
    groups.push({ type: 'msg', ...msg })
  })
  return groups
}

export default function ChatWindow() {
  const { convId } = useParams()
  const { user, refreshUser, setUser } = useAuth()
  const navigate = useNavigate()

  const [convo, setConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [presence, setPresence] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [activeCall, setActiveCall] = useState(null)
  const [startingCall, setStartingCall] = useState(false)
  const [otherUserData, setOtherUserData] = useState(null)

  const bottomRef = useRef(null)
  const searchRef = useRef(null)
  const messagesRef = useRef([])
  const isAtBottom = useRef(true)

  const { typingUsers } = useTyping(convId, user?.uid)
  // Debug typing users map for troubleshooting typing indicator issues
  console.debug('[ChatWindow] typingUsers', { convId, typingUsers })

  useEffect(() => { messagesRef.current = messages }, [messages])

  useEffect(() => {
    if (!convId) return
    setLoading(true)
    getConversation(convId).then(data => { setConvo(data); setLoading(false) }).catch(() => setLoading(false))
  }, [convId])

  useEffect(() => {
    if (!convId || !user?.uid) return
    const unsub = watchMessages(convId, msgs => {
      setMessages(msgs)
      if (isAtBottom.current && document.hasFocus()) markSeen(convId, user.uid, msgs).catch(() => {})
    })
    return unsub
  }, [convId, user?.uid])

  // When opening a conversation, always jump to the most recent messages.
  // This ensures users see the bottom of the chat immediately on open.
  useEffect(() => {
    if (!convId) return
    const t = setTimeout(() => {
      try {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
        isAtBottom.current = true
      } catch (err) {
        console.warn('auto-scroll failed:', err)
      }
    }, 80)
    return () => clearTimeout(t)
  }, [convId])

  useEffect(() => {
    function onFocus() {
      if (convId && user?.uid && isAtBottom.current) {
        markSeen(convId, user.uid, messagesRef.current).catch(() => {})
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [convId, user?.uid])

  useEffect(() => {
    if (!convo || convo.type === 'group') return
    const otherUid = convo.members?.find(uid => uid !== user.uid)
    if (!otherUid) return
    return watchUserPresence(otherUid, setPresence)
  }, [convo, user?.uid])

  // Fetch other user's profile to enforce their privacy settings
  useEffect(() => {
    if (!convo || convo.type === 'group') return
    const otherUid = convo.members?.find(uid => uid !== user.uid)
    if (!otherUid) return

    // Watch other user's profile in real-time so `blockedByOther` and privacy
    // settings update immediately when they change (no reload required).
    const unsub = onSnapshot(doc(db, 'users', otherUid), snap => {
      if (snap.exists()) setOtherUserData(snap.data())
      else setOtherUserData(null)
    }, err => {
      console.warn('watch other user error:', err?.message)
    })

    return () => unsub()
  }, [convo, user?.uid])

  useEffect(() => {
    if (isAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  useEffect(() => {
    if (searchMode) searchRef.current?.focus()
  }, [searchMode])

  useEffect(() => {
    if (!user?.uid || !convo || convo.type === 'group') return
    const unsub = watchIncomingCalls(user.uid, incoming => {
      if (incoming.convId !== convId || activeCall) return
      toast.custom(t => (
        <IncomingCallToast
          callerName={convo.memberNames?.[incoming.callerId] || 'Someone'}
          callerPhoto={convo.memberPhotos?.[incoming.callerId]}
          callType={incoming.type}
          onAnswer={() => { toast.dismiss(t.id); handleAnswerCall(incoming) }}
          onDecline={() => { toast.dismiss(t.id); handleDeclineCall(incoming.callId) }}
        />
      ), { duration: 3000, id: `incoming-${incoming.callId}` })
    })
    return unsub
  }, [user?.uid, convo, convId, activeCall])

  const startCall = useCallback(async (type) => {
        if (!convo) return toast.error('No conversation selected')
    if (activeCall) return toast.error('You are already in a call')
    const otherUid = convo.members?.find(uid => uid !== user.uid)
    setStartingCall(true)
    try {
      const calleeArg = convo.type === 'group' ? null : otherUid
      const { callId, roomUrl, roomName } = await initiateCall({ callerId: user.uid, calleeId: calleeArg, convId, type })

      if (convo.type === 'group') {
        // Notify all group members
        convo.members?.forEach(memberUid => {
          if (memberUid === user.uid) return
          sendCallNotification(memberUid, {
            callerUid: user.uid,
            callerName: user.displayName || 'Someone',
            callerPhoto: user.photoURL || '',
            convId,
            callId,
            callType: type,
          }).catch(err => console.warn('Group call notif failed:', err?.message))
        })
      } else {
        sendCallNotification(otherUid, {
          callerUid: user.uid,
          callerName: user.displayName || 'Someone',
          callerPhoto: user.photoURL || '',
          convId,
          callId,
          callType: type,
        }).catch(err => console.warn('Call notif failed:', err?.message))
      }

            setActiveCall({
        callId,
        isCaller: true,
        callType: type,
        callerName: user.displayName || 'Me',
        callerPhoto: user.photoURL || null,
        calleeName: convo.type === 'group' ? (convo.groupName || 'Group') : (convo.memberNames?.[otherUid] || 'Unknown'),
        calleePhoto: convo.type === 'group' ? (convo.groupPhoto || null) : (convo.memberPhotos?.[otherUid] || null),
        calleeUid: otherUid,
        roomUrl,
        roomName,
        isGroupCall: convo.type === 'group',
      })
    } catch (err) {
      toast.error(err.message || 'Failed to start call')
    } finally {
      setStartingCall(false)
    }
  }, [convo, convId, user, activeCall])

  const handleCallTimeout = useCallback(async (calleeUid, callId, callType) => {
    if (!calleeUid) return
    try {
      await markCallMissed(callId)
      await sendMissedCallNotification(calleeUid, {
        callerUid: user.uid,
        callerName: user.displayName || 'Someone',
        callerPhoto: user.photoURL || '',
        convId,
        callId,
        callType: callType || 'audio',
      })
    } catch (err) {
      console.warn('Missed call notif failed:', err?.message)
    }
  }, [user, convId])

  const handleAnswerCall = useCallback((incoming) => {
        setActiveCall({
      callId: incoming.callId,
      isCaller: false,
      callType: incoming.type,
      callerName: convo?.memberNames?.[incoming.callerId] || 'Someone',
      callerPhoto: convo?.memberPhotos?.[incoming.callerId] || null,
      calleeName: user.displayName || 'Me',
      calleePhoto: user.photoURL || null,
      isGroupCall: convo?.type === 'group',
    })
  }, [convo, user])

  const handleDeclineCall = useCallback(async (callId) => {
    try { await declineCall(callId) } catch {}
  }, [])

    const handleCallEnd = useCallback(() => setActiveCall(null), [])

  const handleJoinCall = useCallback(async (callId, roomUrl) => {
    if (!callId) return toast.error('Call session not found')
    if (activeCall) return toast.error('You are already in a call')
    try {
      await acceptCall(callId)
            setActiveCall({
        callId,
        isCaller: false,
        callType: 'audio',
        callerName: convo?.groupName || 'Group',
        callerPhoto: convo?.groupPhoto || null,
        calleeName: user.displayName || 'Me',
        calleePhoto: user.photoURL || null,
        roomUrl,
        roomName: null,
        isGroupCall: true,
      })
    } catch (err) {
      toast.error(err.message || 'Failed to join call')
    }
  }, [activeCall, convo, user])

  const isGroup = convo?.type === 'group'
  const otherUid = convo?.members?.find(uid => uid !== user.uid)
  const chatName = isGroup ? convo?.groupName : convo?.memberNames?.[otherUid] || 'Chat'
  const chatPhoto = isGroup ? convo?.groupPhoto : convo?.memberPhotos?.[otherUid]
  const avatarColor = getAvatarColor(chatName || '')
  const isOnline = !isGroup && presence?.status === 'online'
  const isAway = !isGroup && presence?.status === 'away'
  const isMuted = convo?.mutedBy?.includes(user?.uid)
  const isPinned = convo?.pinnedBy?.includes(user?.uid)
  const isAdmin = convo?.admins?.includes(user?.uid)

  const blockedOther = Boolean(otherUid && user?.blockedUsers?.includes(otherUid))
  const blockedByOther = Boolean(otherUid && otherUserData?.blockedUsers?.includes(user.uid))
  const isBlockedChat = blockedOther || blockedByOther
  const blockedReason = blockedOther
    ? 'You have blocked this user. Messaging is disabled until you unblock them.'
    : blockedByOther
      ? `${chatName} has blocked you. You cannot send messages in this chat.`
      : ''

  // Respect the other user's privacy settings for online status and last seen
  // In a private chat, both users are friends (they must have connected to chat)
  const showOnline = !isGroup && canShowOnlineStatus(otherUserData, 'friend')
  const showLastSeen = !isGroup && canShowLastSeen(otherUserData, 'friend')

  const statusText = isGroup
    ? `${convo?.members?.length || 0} members`
    : (isOnline || isAway) && showOnline
      ? isOnline ? 'Online' : 'Away'
      : showLastSeen && presence?.lastSeen
        ? `Last seen ${formatLastSeen(presence.lastSeen)}`
        : 'Offline'

  const whoTyping = Object.keys(typingUsers || {})
    .filter(uid => uid !== user.uid)
    .map(uid => convo?.memberNames?.[uid]?.split(' ')[0] || 'Someone')
  console.debug('[ChatWindow] whoTyping', whoTyping)

  const displayed = searchQ.trim()
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQ.toLowerCase()))
    : messages

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
      <div className="spinner" />
    </div>
  )

  if (!convo) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-tertiary)' }}>Conversation not found.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', overflow: 'hidden', position: 'relative' }}>

      <div className="chat-topbar">
        <button onClick={() => navigate('/app/chats')} className="hide-desktop topbar-btn" style={{ color: 'var(--text-primary)', marginRight: '4px' }}>
          <ArrowLeft size={20} />
        </button>

        <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setShowInfo(v => !v)}>
          {chatPhoto
            ? <img src={chatPhoto} alt={chatName} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarColor.bg, color: avatarColor.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>{getInitials(chatName || '?')}</div>
          }
          {!isGroup && (
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%', border: '2px solid var(--bg-primary)', background: isOnline && showOnline ? 'var(--online)' : isAway && showOnline ? 'var(--away)' : 'var(--offline)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setShowInfo(v => !v)}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatName}</p>
          <p style={{ fontSize: 12, margin: 0, color: (isOnline && showOnline) ? 'var(--online)' : (isAway && showOnline) ? 'var(--away)' : 'var(--text-tertiary)' }}>{statusText}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <TBtn onClick={() => setSearchMode(v => !v)} icon="search" />
                    <TBtn onClick={() => startCall('audio')} icon={startingCall ? 'hourglass_empty' : 'call'} disabled={startingCall || isBlockedChat} />
          <TBtn onClick={() => startCall('video')} icon={startingCall ? 'hourglass_empty' : 'videocam'} disabled={startingCall || isBlockedChat} />
          <TBtn onClick={() => setShowInfo(v => !v)} icon="more_vert" />
        </div>
      </div>

      {searchMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <MagnifyingGlass size={15} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={searchRef}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
            placeholder="Search messages…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <button onClick={() => { setSearchMode(false); setSearchQ('') }} style={{ fontSize: 13, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
        </div>
      )}

      {isBlockedChat && (
        <div style={{ margin: '0 14px 10px', padding: '12px 14px', borderRadius: 16, background: blockedOther ? 'rgba(59,130,246,0.1)' : 'rgba(248,113,113,0.12)', border: '1px solid', borderColor: blockedOther ? 'rgba(59,130,246,0.2)' : 'rgba(248,113,113,0.3)', color: blockedOther ? 'var(--text-primary)' : 'var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, lineHeight: 1.4 }}>{blockedReason}</span>
            {blockedOther && (
              <button
                onClick={async () => {
                  try {
                    const userRef = doc(db, 'users', user.uid)
                    await updateDoc(userRef, { blockedUsers: arrayRemove(otherUid) })
                    await refreshUser()
                    toast.success('User unblocked')
                  } catch (err) {
                    toast.error('Unable to unblock')
                  }
                }}
                style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}
              >
                Unblock
              </button>
            )}
          </div>
        </div>
      )}

      <div className="message-area" onScroll={e => {
        const el = e.currentTarget
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}>
        {groupByDate(displayed).map(item =>
          item.type === 'divider' ? (
            <div key={item.id} className="date-divider"><span>{item.label}</span></div>
          ) : (
            <MessageBubble
              key={item.id}
              msg={item}
              isMine={item.senderId === user.uid}
              convId={convId}
              currentUid={user.uid}
              isGroup={isGroup}
              senderName={isGroup ? convo.memberNames?.[item.senderId] : null}
              senderPhoto={isGroup ? convo.memberPhotos?.[item.senderId] : null}
                            onReply={setReplyTo}
              memberNames={convo.memberNames || {}}
              onJoinCall={isGroup ? handleJoinCall : undefined}
            />
          )
        )}
        {whoTyping.length > 0 && <div style={{ padding: '4px 14px' }}><TypingIndicator names={whoTyping} /></div>}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        convId={convId}
        currentUser={user}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        isGroup={isGroup}
        isAdmin={isAdmin}
        convo={convo}
        members={convo?.members || []}
        memberNames={convo?.memberNames || {}}
        disabledMessage={blockedReason}
      />

      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}
          >
            <InfoPanel
              convo={convo}
              chatName={chatName}
              chatPhoto={chatPhoto}
              avatarColor={avatarColor}
              isGroup={isGroup}
              isAdmin={isAdmin}
              isMuted={isMuted}
              isPinned={isPinned}
              currentUid={user.uid}
              currentUser={user}
              otherUid={otherUid}
              onClose={() => setShowInfo(false)}
              navigate={navigate}
              onStartCall={startCall}
              convId={convId}
              onConvoUpdate={setConvo}
              refreshUser={refreshUser}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {activeCall && <CallScreen {...activeCall} currentUser={user} onEnd={handleCallEnd} isGroup={activeCall.isGroupCall} />}
    </div>
  )
}

function TBtn({ icon, onClick, title, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} className="topbar-btn" style={{ opacity: disabled ? 0.5 : 1 }}>
      <span className="material-icons" style={{ fontSize: 20 }}>{icon}</span>
    </button>
  )
}

function InfoPanel({ convo, chatName, chatPhoto, avatarColor, isGroup, isAdmin, isMuted, isPinned, currentUid, currentUser, otherUid, onClose, navigate, onStartCall, convId, onConvoUpdate, refreshUser }) {
  const { setUser: setUserFromContext } = useAuth()
  const [announceText, setAnnounceText] = useState('')
  const [renameText, setRenameText] = useState(convo?.groupName || '')
  const [nickname, setNickname] = useState(convo?.nicknames?.[otherUid] || '')
  const [selectedMember, setSelectedMember] = useState(null)
  const [loading, setLoading] = useState(false)
  const [otherProfile, setOtherProfile] = useState(null)
  const [modal, setModal] = useState(null)

  useEffect(() => {
    if (isGroup || !otherUid) return
    getDoc(doc(db, 'users', otherUid)).then(snap => {
      if (snap.exists()) setOtherProfile({ uid: otherUid, ...snap.data() })
    }).catch(() => {})
  }, [isGroup, otherUid])

  const isBlocked = currentUser?.blockedUsers?.includes(otherUid)

    async function handleToggleMute() {
    try {
      await toggleMute(convId, currentUid, !isMuted)
      onConvoUpdate(prev => ({
        ...prev,
        mutedBy: isMuted
          ? (prev.mutedBy || []).filter(u => u !== currentUid)
          : [...(prev.mutedBy || []), currentUid],
      }))
    } catch {
      toast.error('Failed')
    }
  }

  async function handleTogglePin() {
    try {
      await togglePin(convId, currentUid, !isPinned)
      onConvoUpdate(prev => ({
        ...prev,
        pinnedBy: isPinned
          ? (prev.pinnedBy || []).filter(u => u !== currentUid)
          : [...(prev.pinnedBy || []), currentUid],
      }))
    } catch {
      toast.error('Failed')
    }
  }

    async function handleBlockToggle() {
    const userRef = doc(db, 'users', currentUid)
    // Optimistically update local user state for immediate UI feedback.
    try {
      setUserFromContext(prev => {
        if (!prev) return prev
        const cur = new Set(prev.blockedUsers || [])
        if (isBlocked) {
          cur.delete(otherUid)
        } else {
          cur.add(otherUid)
        }
        return { ...prev, blockedUsers: Array.from(cur) }
      })

      if (isBlocked) {
        await updateDoc(userRef, { blockedUsers: arrayRemove(otherUid) })
      } else {
        await updateDoc(userRef, { blockedUsers: arrayUnion(otherUid) })
      }

      setModal(null)
    } catch (err) {
      // Revert optimistic change on failure
      try {
        // reload from server to restore authoritative state
        if (typeof refreshUser === 'function') await refreshUser()
      } catch (_) {}
      console.error('Block toggle failed:', err)
      toast.error('Failed')
    }
  }

    async function handleSaveNickname() {
    setLoading(true)
    try {
      const nicknames = { ...(convo.nicknames || {}), [otherUid]: nickname.trim() }
      await updateDoc(doc(db, 'conversations', convId), { nicknames })
      onConvoUpdate(prev => ({ ...prev, nicknames }))
      setModal(null)
    } catch {
      toast.error('Failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteConversation() {
    setLoading(true)
    try {
      const msgsSnap = await getDocs(collection(db, 'conversations', convId, 'messages'))
      const batchSize = 450

      for (let i = 0; i < msgsSnap.docs.length; i += batchSize) {
        const { writeBatch: wb } = await import('firebase/firestore')
        const batch = wb(db)
        msgsSnap.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref))
        await batch.commit()
      }

      await deleteDoc(doc(db, 'conversations', convId))
      toast.success('Conversation deleted')
      navigate('/app/chats', { replace: true })
    } catch {
      toast.error('Failed to delete')
      setLoading(false)
    }
  }

  async function handleSendAnnouncement() {
    if (!announceText.trim()) return toast.error('Write something first')
    setLoading(true)
    try {
      await sendAnnouncement(convId, currentUid, announceText.trim(), convo)
      setAnnounceText('')
      setModal(null)
      toast.success('Announcement sent!')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

    async function handleRenameGroup() {
    if (!renameText.trim()) return toast.error('Enter a group name')
    setLoading(true)
    try {
      await updateGroupInfo(convId, { groupName: renameText.trim() })
      onConvoUpdate(prev => ({ ...prev, groupName: renameText.trim() }))
      setModal(null)
    } catch {
      toast.error('Failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLeaveGroup() {
    setLoading(true)
    try {
      await leaveGroup(convId, currentUid)
      toast.success('You left the group')
      navigate('/app/chats', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Failed')
      setLoading(false)
    }
  }

    async function handleRemoveMember(uid) {
    setLoading(true)
    try {
      await removeGroupMember(convId, uid)
      onConvoUpdate(prev => ({ ...prev, members: (prev.members || []).filter(u => u !== uid) }))
      setSelectedMember(null)
      setModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAdmin(uid) {
    const isCurrentlyAdmin = convo.admins?.includes(uid)
    try {
      await updateDoc(doc(db, 'conversations', convId), {
        admins: isCurrentlyAdmin ? arrayRemove(uid) : arrayUnion(uid),
      })
      onConvoUpdate(prev => ({
        ...prev,
        admins: isCurrentlyAdmin
          ? (prev.admins || []).filter(u => u !== uid)
          : [...(prev.admins || []), uid],
      }))
    } catch {
      toast.error('Failed')
    }
  }

  const nickname_display = convo?.nicknames?.[otherUid]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 300,
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>
            {isGroup ? 'Group Info' : 'Contact Info'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 12px', gap: 6, borderBottom: '1px solid var(--border)' }}>
          {chatPhoto
            ? <img src={chatPhoto} alt={chatName} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 72, height: 72, borderRadius: '50%', background: avatarColor.bg, color: avatarColor.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>{getInitials(chatName || '?')}</div>
          }
          <p style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', margin: 0, textAlign: 'center' }}>{chatName}</p>
          {!isGroup && otherProfile?.username && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>@{otherProfile.username}</p>
          )}
          {!isGroup && nickname_display && (
            <p style={{ fontSize: 12, color: 'var(--primary)', margin: 0 }}>"{nickname_display}"</p>
          )}
          {isGroup && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{convo.members?.length} members</p>
          )}
        </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <QuickBtn icon="call" label="Voice" onClick={() => { onClose(); onStartCall('audio') }} />
            <QuickBtn icon="videocam" label="Video" onClick={() => { onClose(); onStartCall('video') }} />
          </div>

        <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--border)' }}>
          <PanelLabel label="Actions" />
          <PanelRow icon={isPinned ? PushPinSlash : PushPin} label={isPinned ? 'Unpin chat' : 'Pin chat'} onClick={handleTogglePin} />
          <PanelRow icon={isMuted ? Bell : BellSlash} label={isMuted ? 'Unmute notifications' : 'Mute notifications'} onClick={handleToggleMute} />
          {!isGroup && <PanelRow icon={PencilSimple} label="Set nickname" onClick={() => setModal('nickname')} />}
          {isGroup && isAdmin && <PanelRow icon={Megaphone} label="Send announcement" onClick={() => setModal('announce')} />}
          {isGroup && isAdmin && <PanelRow icon={PencilSimple} label="Rename group" onClick={() => setModal('rename')} />}
          {isGroup && <PanelRow icon={Gear} label="Manage group" onClick={() => { onClose(); navigate(`/app/group/${convId}`) }} />}
        </div>

        <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--border)' }}>
          <PanelLabel label="Danger" />
          {!isGroup && (
            <PanelRow icon={Prohibit} label={isBlocked ? 'Unblock user' : 'Block user'} danger onClick={() => setModal('block')} />
          )}
          <PanelRow icon={Trash} label="Delete conversation" danger onClick={() => setModal('delete')} />
          {isGroup && <PanelRow icon={SignOut} label="Leave group" danger onClick={() => setModal('leave')} />}
        </div>

        {isGroup && convo.members && (
          <div style={{ padding: '8px' }}>
            <PanelLabel label={`Members (${convo.members.length})`} />
            {convo.members.map(uid => {
              const ac = getAvatarColor(convo.memberNames?.[uid] || '')
              const isOwn = uid === currentUid
              const memAdmin = convo.admins?.includes(uid)
              const photo = convo.memberPhotos?.[uid]

              return (
                <div
                  key={uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 12,
                    cursor: isAdmin && !isOwn ? 'pointer' : 'default',
                  }}
                  onClick={() => isAdmin && !isOwn && setSelectedMember(uid === selectedMember ? null : uid)}
                  onMouseEnter={e => isAdmin && !isOwn && (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {photo
                    ? <img src={photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: ac.bg, color: ac.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{getInitials(convo.memberNames?.[uid] || '?')}</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isOwn ? 'You' : convo.memberNames?.[uid] || uid}
                    </p>
                    {memAdmin && <p style={{ margin: 0, fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>Admin</p>}
                  </div>
                  {isAdmin && !isOwn && <CaretRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                </div>
              )
            })}

            {selectedMember && isAdmin && (
              <div style={{ margin: '4px 0 8px', padding: '8px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                <button
                  onClick={() => handleToggleAdmin(selectedMember)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Crown size={12} color="var(--primary)" />
                  {convo.admins?.includes(selectedMember) ? 'Remove admin' : 'Make admin'}
                </button>

                <button
                  onClick={() => setModal('removeMember')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 10,
                    border: '1px solid #fca5a5',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <UserMinus size={12} />
                  Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => !loading && setModal(null)}
          >
            <motion.div
              style={{ width: 'min(420px,100%)', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-primary)', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}
              onClick={e => e.stopPropagation()}
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            >
              {modal === 'announce' && (
                <>
                  <ModalH title="📢 Send Announcement" onClose={() => setModal(null)} />
                  <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>This will be highlighted and notify all members</p>
                  <textarea
                    value={announceText}
                    onChange={e => setAnnounceText(e.target.value)}
                    placeholder="Write your announcement…"
                    maxLength={500}
                    rows={4}
                    style={{ width: '100%', padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                  />
                  <p style={{ margin: '4px 0 12px', fontSize: 11, textAlign: 'right', color: 'var(--text-tertiary)' }}>{announceText.length}/500</p>
                  <ModalBtn label={loading ? 'Sending…' : 'Send Announcement'} disabled={loading} onClick={handleSendAnnouncement} />
                </>
              )}

              {modal === 'rename' && (
                <>
                  <ModalH title="Rename Group" onClose={() => setModal(null)} />
                  <input
                    value={renameText}
                    onChange={e => setRenameText(e.target.value)}
                    placeholder="Group name"
                    maxLength={50}
                    style={{ width: '100%', marginTop: 12, padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <ModalBtn label={loading ? 'Saving…' : 'Save Name'} disabled={loading} onClick={handleRenameGroup} />
                </>
              )}

              {modal === 'nickname' && (
                <>
                  <ModalH title="Set Nickname" onClose={() => setModal(null)} />
                  <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>Only you can see this nickname</p>
                  <input
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder={`Nickname for ${chatName}`}
                    maxLength={30}
                    style={{ width: '100%', padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <ModalBtn label={loading ? 'Saving…' : 'Save Nickname'} disabled={loading} onClick={handleSaveNickname} />
                </>
              )}

              {modal === 'block' && (
                <>
                  <ModalH title={isBlocked ? 'Unblock User' : 'Block User'} onClose={() => setModal(null)} />
                  <p style={{ margin: '10px 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {isBlocked
                      ? `Unblocking ${chatName} will allow them to send you messages again.`
                      : `Blocking ${chatName} will prevent them from messaging you. You can unblock them anytime.`}
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setModal(null)}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBlockToggle}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #b91c1c', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
                    >
                      {isBlocked ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </>
              )}

              {modal === 'delete' && (
                <>
                  <ModalH title="Delete Conversation" onClose={() => !loading && setModal(null)} />
                  <p style={{ margin: '10px 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>This will permanently delete all messages. This cannot be undone.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setModal(null)}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteConversation}
                      disabled={loading}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #b91c1c', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
                    >
                      {loading ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </>
              )}

              {modal === 'leave' && (
                <>
                  <ModalH title="Leave Group" onClose={() => !loading && setModal(null)} />
                  <p style={{ margin: '10px 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>You will leave "{convo?.groupName}" and won't receive new messages.</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setModal(null)}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLeaveGroup}
                      disabled={loading}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #b91c1c', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
                    >
                      {loading ? 'Leaving…' : 'Leave Group'}
                    </button>
                  </div>
                </>
              )}

              {modal === 'removeMember' && selectedMember && (
                <>
                  <ModalH title="Remove Member" onClose={() => { setModal(null); setSelectedMember(null) }} />
                  <p style={{ margin: '10px 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Remove <strong>{convo.memberNames?.[selectedMember] || 'this member'}</strong> from the group?</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { setModal(null); setSelectedMember(null) }}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRemoveMember(selectedMember)}
                      disabled={loading}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #b91c1c', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
                    >
                      {loading ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PanelLabel({ label }) {
  return <p style={{ margin: '4px 10px 6px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)' }}>{label}</p>
}

function PanelRow({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: danger ? '#ef4444' : 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'left',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={16} style={{ color: danger ? '#ef4444' : 'var(--primary)', flexShrink: 0 }} />
      {label}
    </button>
  )
}

function QuickBtn({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '9px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <span className="material-icons" style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )
}

function ModalH({ title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>{title}</h2>
      <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <X size={14} />
      </button>
    </div>
  )
}

function ModalBtn({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        marginTop: 14,
        padding: '12px',
        borderRadius: 13,
        border: 'none',
        background: 'var(--primary)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 900,
        cursor: 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}