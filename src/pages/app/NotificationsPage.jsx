// src/pages/app/NotificationsPage.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { acceptGroupInvite, declineGroupInvite } from '../../services/chatService'
import { formatDate, formatTime, getAvatarColor, getInitials } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  MessageCircle,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [notifs, setNotifs] = useState([])

  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(q, snap => {
      setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })

    return () => unsub()
  }, [user?.uid])

  const unreadCount = useMemo(
    () => notifs.filter(n => !n.read).length,
    [notifs]
  )

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifs.filter(n => !n.read)
    return notifs
  }, [filter, notifs])

  const grouped = useMemo(() => {
    const map = new Map()

    for (const item of filtered) {
      const rawDate = item.createdAt?.toDate?.()
      const label = rawDate ? formatDate(rawDate) : 'Earlier'
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
    try {
      await deleteDoc(doc(db, 'notifications', user.uid, 'items', notifId))
    } catch {
      toast.error('Failed to delete notification')
    }
  }

  async function openNotif(notif) {
    if (!notif.read) await markRead(notif.id)

    if (notif.type === 'message' && notif.convId) {
      navigate(`/app/chats/${notif.convId}`)
      return
    }

    if (notif.type === 'friend_request') {
      navigate('/app/friends')
      return
    }

    if (notif.type === 'group_invite' && notif.convId) {
      navigate(`/app/chats/${notif.convId}`)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate('/app/chats')} style={styles.backBtn} title="Back">
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={styles.title}>Notifications</h1>
          <p style={styles.subtitle}>
            Updates, messages, and invitations
          </p>
        </div>

        {unreadCount > 0 && (
          <button onClick={markAllRead} style={styles.secondaryBtn}>
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>

      <div style={styles.tabs}>
        <TabButton active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </TabButton>
        <TabButton active={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
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

function NotifItem({ notif, user, onOpen, onMarkRead, onDelete, style }) {
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)

  const name = notif.fromName || 'Someone'
  const ac = getAvatarColor(name)

  function getIcon() {
    switch (notif.type) {
      case 'message':
        return <MessageCircle size={14} />
      case 'friend_request':
        return <UserPlus size={14} />
      case 'group_invite':
        return <Users size={14} />
      default:
        return <Bell size={14} />
    }
  }

  function getTitle() {
    switch (notif.type) {
      case 'message':
        return `${name} sent you a message`
      case 'friend_request':
        return `${name} sent you a friend request`
      case 'group_invite':
        return `${name} invited you to a group`
      default:
        return notif.title || 'Notification'
    }
  }

  async function handleAcceptInvite(e) {
    e.stopPropagation()
    if (!notif.convId) return

    setAccepting(true)
    try {
      await acceptGroupInvite(notif.convId, user.uid)
      await deleteDoc(doc(db, 'notifications', user.uid, 'items', notif.id))
      toast.success('Joined group')
      navigate(`/app/chats/${notif.convId}`)
    } catch (err) {
      toast.error(err?.message || 'Failed to join group')
    } finally {
      setAccepting(false)
    }
  }

  async function handleDeclineInvite(e) {
    e.stopPropagation()
    if (!notif.convId) return

    setDeclining(true)
    try {
      await declineGroupInvite(notif.convId, user.uid)
      await deleteDoc(doc(db, 'notifications', user.uid, 'items', notif.id))
      toast.success('Invitation declined')
    } catch (err) {
      toast.error(err?.message || 'Failed to decline invitation')
    } finally {
      setDeclining(false)
    }
  }

  return (
    <div
      onClick={() => {
        if (notif.type !== 'group_invite') onOpen()
      }}
      style={{
        ...styles.item,
        opacity: notif.read ? 0.95 : 1,
        borderColor: notif.read ? 'var(--border)' : 'rgba(59,130,246,0.28)',
        background: notif.read ? 'var(--bg-primary)' : 'var(--bg-secondary)',
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
          <div style={styles.title}>{getTitle()}</div>
          {!notif.read && <span style={styles.unreadDot} />}
        </div>

        {notif.text && (
          <div style={styles.text}>{notif.text}</div>
        )}

        <div style={styles.time}>
          {formatTime(notif.createdAt)}
        </div>
      </div>

      <div style={styles.actions}>
        {notif.type === 'group_invite' ? (
          <>
            <button
              onClick={handleAcceptInvite}
              disabled={accepting || declining}
              style={{ ...styles.actionBtn, ...styles.acceptBtn }}
              title="Accept invite"
            >
              {accepting ? <Spinner size={12} /> : <Check size={14} />}
            </button>
            <button
              onClick={handleDeclineInvite}
              disabled={accepting || declining}
              style={{ ...styles.actionBtn, ...styles.declineBtn }}
              title="Decline invite"
            >
              {declining ? <Spinner size={12} /> : <X size={14} />}
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
  title: {
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
    border: '1px solid',
    borderRadius: '999px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
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
    border: '1px solid',
    background: 'var(--bg-primary)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
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
  title: {
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