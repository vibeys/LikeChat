import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  writeBatch,
  getDoc,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { acceptGroupInvite } from '../../services/chatService'
import { formatDate, formatTime, getAvatarColor, getInitials, safeUserDisplayName } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  ArrowLeft,
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Heart,
  Image,
  MessageCircle,
  Megaphone,
  Phone,
  PhoneMissed,
  Trash2,
  UserPlus,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

function toDateValue(notif) {
  const ts = notif?.createdAt
  if (ts?.toDate) return ts.toDate()
  if (typeof notif?.createdAtMs === 'number') return new Date(notif.createdAtMs)
  return new Date(0)
}

function sortNotifs(items) {
  return [...items].sort((a, b) => {
    const ta = a?.createdAtMs || a?.createdAt?.toMillis?.() || 0
    const tb = b?.createdAtMs || b?.createdAt?.toMillis?.() || 0
    return tb - ta
  })
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [notifs, setNotifs] = useState([])
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    if (!user?.uid) return

    const q = query(collection(db, 'notifications', user.uid, 'items'))

    const unsub = onSnapshot(
      q,
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setNotifs(sortNotifs(items))
        setLoading(false)
      },
      err => {
        console.error('Notification snapshot error:', err)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [user?.uid])

  const unreadCount = useMemo(() => notifs.filter(n => !n.read).length, [notifs])

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifs.filter(n => !n.read)
    return notifs
  }, [filter, notifs])

  const grouped = useMemo(() => {
    const map = new Map()

    for (const item of filtered) {
      const label = formatDate(toDateValue(item))
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(item)
    }

    return Array.from(map.entries())
  }, [filtered])

  async function markRead(notifId) {
    try {
      await updateDoc(doc(db, 'notifications', user.uid, 'items', notifId), {
        read: true,
      })
    } catch {
      toast.error('Failed to mark as read')
    }
  }

  async function markAllRead() {
    const unread = notifs.filter(n => !n.read)
    if (!unread.length) return

    try {
      const batch = writeBatch(db)
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', user.uid, 'items', n.id), {
          read: true,
        })
      })
      await batch.commit()
      toast.success('All marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  async function deleteNotif(notifId) {
    setDeletingId(notifId)
    await new Promise(r => setTimeout(r, 200))
    try {
      await deleteDoc(doc(db, 'notifications', user.uid, 'items', notifId))
      setDeletingId(null)
    } catch (err) {
      console.error('Failed to delete notification:', err)
      setDeletingId(null)
      toast.error('Failed to delete notification')
    }
  }

  async function openNotif(notif) {
    if (notif.type === 'group_invite') return

    if (!notif.read) await markRead(notif.id)

    // All chat-related types navigate to the conversation
    if (['message', 'media', 'reaction', 'mention', 'announce', 'call', 'missed_call'].includes(notif.type)) {
      if (notif.convId) navigate(`/app/chats/${notif.convId}`)
      else navigate('/app/notifications')
      return
    }

    // Friend-related types go to the friends page
    if (['friend_request', 'friend_accepted'].includes(notif.type)) {
      navigate('/app/friends')
      return
    }

    // Fallback
    navigate('/app/notifications')
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate('/app/chats')} style={styles.backBtn} title="Back">
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={styles.headerTitle}>Notifications</h1>
          <p style={styles.subtitle}>Updates, messages, and invitations</p>
        </div>

        {unreadCount > 0 && (
          <button onClick={markAllRead} style={styles.secondaryBtn}>
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>

      <div style={styles.tabs}>
        <TabButton active={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
        </TabButton>
        <TabButton active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </TabButton>
      </div>

      <div style={styles.content}>
        {loading ? (
          <div style={styles.center}>
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
            text={
              filter === 'unread'
                ? 'You have no unread notifications.'
                : 'Messages, requests, and invites will appear here.'
            }
          />
        ) : (
          grouped.map(([dateLabel, items]) => (
            <div key={dateLabel} style={styles.section}>
              <div style={styles.dateLabel}>{dateLabel}</div>
              <div style={styles.list}>
                {items.map((notif, idx) => (
                  <NotifItem
                    key={notif.id}
                    notif={notif}
                    user={user}
                    onOpen={() => openNotif(notif)}
                    onMarkRead={() => markRead(notif.id)}
                    onDelete={() => deleteNotif(notif.id)}
                    isDeleting={deletingId === notif.id}
                    style={{ animationDelay: `${idx * 0.04}s` }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function NotifItem({ notif, user, onOpen, onMarkRead, onDelete, isDeleting, style }) {
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [senderExists, setSenderExists] = useState(true)

  // Check if sender account still exists
  useEffect(() => {
    if (!notif.fromUid) {
      setSenderExists(false)
      return
    }
    getDoc(doc(db, 'users', notif.fromUid))
      .then(snap => setSenderExists(snap.exists()))
      .catch(() => setSenderExists(false))
  }, [notif.fromUid])

  const name = safeUserDisplayName({ displayName: notif.fromName }, !senderExists)
  const ac = getAvatarColor(notif.fromName || 'unknown')

  function getIcon() {
    const isVideo = notif.data?.callType === 'video'
    switch (notif.type) {
      case 'message':         return <MessageCircle size={14} />
      case 'media':           return <Image size={14} />
      case 'reaction':        return <Heart size={14} />
      case 'friend_request':  return <UserPlus size={14} />
      case 'friend_accepted': return <UserCheck size={14} />
      case 'group_invite':    return <Users size={14} />
      case 'announce':        return <Megaphone size={14} />
      case 'mention':         return <AtSign size={14} />
      case 'call':            return isVideo ? <Video size={14} /> : <Phone size={14} />
      case 'missed_call':     return <PhoneMissed size={14} />
      default:                return <Bell size={14} />
    }
  }

  function getTitle() {
    const isVideo = notif.data?.callType === 'video'
    switch (notif.type) {
      case 'message':         return `${name} sent you a message`
      case 'media':           return `${name} sent media`
      case 'reaction':        return `${name} reacted ${notif.emoji ? notif.emoji + ' ' : ''}to your message`
      case 'friend_request':  return `${name} sent you a friend request`
      case 'friend_accepted': return `${name} accepted your friend request`
      case 'group_invite':    return `${name} invited you to a group`
      case 'announce':        return `📢 Announcement in ${notif.groupName || 'a group'}`
      case 'mention':         return `${name} mentioned you`
      case 'call':            return isVideo ? `📹 Incoming video call from ${name}` : `📞 Incoming call from ${name}`
      case 'missed_call':     return isVideo ? `📹 Missed video call from ${name}` : `📞 Missed call from ${name}`
      default:                return notif.title || 'New notification'
    }
  }

  function getBody() {
    if (notif.type === 'group_invite') {
      return notif.text || `Join "${notif.groupName || 'this group'}"`
    }
    return notif.text || ''
  }

  async function handleJoinInvite(e) {
    e.stopPropagation()
    if (!notif.convId) return

    setAccepting(true)
    try {
      await acceptGroupInvite(notif.convId, user.uid)
      await deleteDoc(doc(db, 'notifications', user.uid, 'items', notif.id))
      toast.success('Joined group')
      navigate(`/app/chats/${notif.convId}`)
    } catch (err) {
      const msg =
        err?.code === 'permission-denied' || /permissions/i.test(err?.message || '')
          ? 'Firestore blocked the join. Update your rules for pending members.'
          : (err?.message || 'Failed to join group')
      toast.error(msg)
    } finally {
      setAccepting(false)
    }
  }

  async function handleDismissInvite(e) {
    e.stopPropagation()
    await onDelete()
  }

  return (
    <div
      onClick={() => {
        if (notif.type !== 'group_invite') onOpen()
      }}
      style={{
        ...styles.item,
        animation: isDeleting ? 'slideOutRight 0.2s ease-in forwards' : 'popIn 0.3s ease-out',
        ...style,
      }}
    >
      <div style={styles.avatarWrap}>
        {notif.fromPhoto ? (
          <img src={notif.fromPhoto} alt={name} style={styles.avatar} />
        ) : (
          <div style={{ ...styles.avatar, background: ac.bg, color: ac.text }}>
            {getInitials(name)}
          </div>
        )}
      </div>

      <div style={styles.body}>
        <div style={styles.topRow}>
          <div style={styles.iconPill}>{getIcon()}</div>
          <div style={styles.itemTitle}>{getTitle()}</div>
          {!notif.read && <span style={styles.unreadDot} />}
        </div>

        {getBody() && <div style={styles.text}>{getBody()}</div>}

        <div style={styles.time}>{formatTime(toDateValue(notif))}</div>
      </div>

      <div style={styles.actions}>
        {notif.type === 'group_invite' ? (
          <>
            <button
              onClick={handleJoinInvite}
              disabled={accepting}
              style={{ ...styles.actionBtn, ...styles.acceptBtn }}
              title="Join group"
            >
              {accepting ? <Spinner size={12} /> : <Check size={14} />}
            </button>
            <button
              onClick={handleDismissInvite}
              style={{ ...styles.actionBtn, ...styles.declineBtn }}
              title="Delete invite"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <>
            {!notif.read && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  onMarkRead()
                }}
                style={{ ...styles.actionBtn, ...styles.acceptBtn }}
                title="Mark as read"
              >
                <Check size={14} />
              </button>
            )}
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
              style={{ ...styles.actionBtn, ...styles.declineBtn }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
      }}
    >
      {children}
    </button>
  )
}

function EmptyState({ title, text }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIconWrap}>
        <Bell size={30} />
      </div>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyText}>{text}</div>
    </div>
  )
}

const styles = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 18px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
  },
  backBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  secondaryBtn: {
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    padding: '12px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
    overflowX: 'auto',
  },
  tabBtn: {
    border: '1px solid var(--border)',
    borderRadius: '999px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
    background: 'transparent',
    color: 'var(--text-tertiary)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 18px 18px',
  },
  section: {
    marginBottom: '16px',
  },
  dateLabel: {
    fontSize: '12px',
    fontWeight: 900,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    margin: '0 0 10px 2px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: '15px',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  iconPill: {
    width: '22px',
    height: '22px',
    borderRadius: '7px',
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--primary)',
    flexShrink: 0,
  },
  text: {
    marginTop: '6px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  time: {
    marginTop: '7px',
    fontSize: '11px',
    color: 'var(--text-tertiary)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  actionBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    border: '1px solid',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  acceptBtn: {
    borderColor: 'rgba(59,130,246,0.28)',
    background: 'rgba(59,130,246,0.10)',
    color: 'var(--primary)',
  },
  declineBtn: {
    borderColor: 'rgba(239,68,68,0.28)',
    background: 'rgba(239,68,68,0.10)',
    color: 'var(--danger)',
  },
  emptyState: {
    minHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '10px',
  },
  emptyIconWrap: {
    width: '70px',
    height: '70px',
    borderRadius: '22px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: '17px',
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-tertiary)',
    maxWidth: '320px',
    lineHeight: 1.5,
  },
}