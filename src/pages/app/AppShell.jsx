// src/pages/app/AppShell.jsx
import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { onSnapshot, collection, query, orderBy } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { watchConversations, createGroupConv, acceptGroupInvite } from '../../services/chatService'
import { watchUserPresence } from '../../lib/presence'
import { formatTime, getInitials, getAvatarColor } from '../../lib/utils'
import { logout } from '../../services/authService'
import { searchByUsername } from '../../services/userService'
import { deleteNotification, markNotificationRead } from '../../services/notificationService'
import { db } from '../../lib/firebase'
import toast from 'react-hot-toast'
import {
  ChatCircleDots,
  Users,
  Bell,
  UserCircle,
  SignOut,
  GearSix,
  UsersThree,
  NotePencil,
  MagnifyingGlass,
  X,
  CheckCircle,
  UserPlus,
  Heart,
  At,
  Megaphone,
  Phone,
  Video,
} from '@phosphor-icons/react'

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'chats',   Icon: ChatCircleDots, label: 'Chats',         path: '/app/chats' },
  { id: 'friends', Icon: Users,          label: 'Friends',       path: '/app/friends' },
  { id: 'notifs',  Icon: Bell,           label: 'Notifications', path: '/app/notifications' },
  { id: 'profile', Icon: null,           label: 'Profile',       path: '/app/profile', photo: true },
  { id: 'settings', Icon: GearSix,       label: 'Settings',      path: '/app/settings' },
]

const FILTER_TABS = ['all', 'unread', 'groups']

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [convos,       setConvos]       = useState([])
  const [search,       setSearch]       = useState('')
  const [filter,       setFilter]       = useState('all')
  const [presence,     setPresence]     = useState({})
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [notifUnread,  setNotifUnread]  = useState(0)

  const notifSeenRef   = useRef(new Set())
  const notifBootedRef = useRef(false)

  const isChatListRoute   = location.pathname === '/app/chats'
  const isChatThreadRoute = /^\/app\/chats\/[^/]+/.test(location.pathname)
  const showMobileNav     = !isChatThreadRoute
  const activeConvId      = location.pathname.match(/\/app\/chats\/(.+)/)?.[1]

    const activeNav = (() => {
    if (location.pathname.startsWith('/app/friends'))       return 'friends'
    if (location.pathname.startsWith('/app/notifications')) return 'notifs'
    if (location.pathname.startsWith('/app/settings'))      return 'settings'
    if (location.pathname.startsWith('/app/profile'))       return 'profile'
    return 'chats'
  })()

  // ── Watch conversations ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    return watchConversations(user.uid, setConvos)
  }, [user?.uid])

  // ── Watch presence ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!convos.length || !user?.uid) return
    const uids = [
      ...new Set(convos.flatMap(c => c.members ?? []).filter(uid => uid !== user.uid)),
    ]
    const unsubs = uids.map(uid =>
      watchUserPresence(uid, data => setPresence(prev => ({ ...prev, [uid]: data })))
    )
    return () => unsubs.forEach(fn => fn())
  }, [convos, user?.uid])

  // ── Watch notifications ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setNotifUnread(items.filter(n => !n.read).length)
      if (!notifBootedRef.current) {
        items.forEach(n => notifSeenRef.current.add(n.id))
        notifBootedRef.current = true
        return
      }
      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return
        const notif = { id: change.doc.id, ...change.doc.data() }
        if (notifSeenRef.current.has(notif.id)) return
        notifSeenRef.current.add(notif.id)
        if (!notif.read) showPopupNotif(notif)
      })
      items.forEach(n => notifSeenRef.current.add(n.id))
    })
    return () => unsub()
  }, [user?.uid])

  // ── Popup notification toast ──────────────────────────────────────────────
  function showPopupNotif(notif) {
    const name = notif.fromName || 'Someone'

    if (notif.type === 'group_invite') {
      toast.custom(
        t => (
          <PopupCard duration={10000}>
            <PopupIconBox type="group" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={popupStyles.title}>
                {notif.title || `${name} invited you to a group`}
              </div>
              <div style={popupStyles.body}>
                {notif.text || `Join "${notif.groupName || 'this group'}"`}
              </div>
            </div>
            <div style={popupStyles.btnRow}>
              <button
                style={popupStyles.primaryBtn}
                onClick={async e => {
                  e.stopPropagation()
                  if (!notif.convId) return
                  try {
                    await acceptGroupInvite(notif.convId, user.uid)
                    await deleteNotification(user.uid, notif.id)
                    toast.dismiss(t.id)
                    toast.success('Joined group')
                    navigate(`/app/chats/${notif.convId}`)
                  } catch (err) {
                    toast.error(err?.message || 'Failed to join group')
                  }
                }}
              >
                Join
              </button>
              <button
                style={popupStyles.secondaryBtn}
                onClick={e => { e.stopPropagation(); toast.dismiss(t.id) }}
              >
                Later
              </button>
            </div>
          </PopupCard>
        ),
        { duration: 10000 }
      )
      return
    }

    const body = (() => {
      switch (notif.type) {
        case 'friend_request':  return 'You have a new friend request.'
        case 'friend_accepted': return `${name} accepted your friend request. You are now friends!`
        case 'reaction':        return `${name} reacted ${notif.emoji ? notif.emoji + ' ' : ''}to your message.`
        case 'media':           return `${name} sent you a media message.`
        case 'mention':         return notif.text ? `${name} mentioned you: "${notif.text}"` : `${name} mentioned you in a chat.`
        case 'announce':        return notif.text || `New announcement in ${notif.groupName || 'a group'}.`
        case 'call':            return notif.text || (notif.data?.callType === 'video' ? 'Incoming video call' : 'Incoming audio call')
        case 'missed_call':     return notif.text || (notif.data?.callType === 'video' ? 'Missed video call' : 'Missed audio call')
        default:                return notif.text || `${name} sent you a message.`
      }
    })()

    const openLabel = (() => {
      switch (notif.type) {
        case 'friend_request':
        case 'friend_accepted': return 'Open friends'
        default:                return 'Open chat'
      }
    })()

    async function handleOpen() {
      toast.dismiss()
      if (!notif.read) markNotificationRead(user.uid, notif.id).catch(() => {})
      if (['friend_request', 'friend_accepted'].includes(notif.type)) {
        navigate('/app/friends')
      } else if (notif.convId) {
        navigate(`/app/chats/${notif.convId}`)
      } else {
        navigate('/app/notifications')
      }
    }

    const dur = notif.type === 'call' ? 30000 : 10000

    toast.custom(
      t => (
        <PopupCard onClick={handleOpen} duration={dur}>
          <PopupIconBox type={notif.type} callType={notif.data?.callType} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={popupStyles.title}>{notif.title || name}</div>
            <div style={popupStyles.body}>{body}</div>
          </div>
          <div style={popupStyles.btnRow}>
            <button
              style={popupStyles.primaryBtn}
              onClick={e => { e.stopPropagation(); handleOpen() }}
            >
              {openLabel}
            </button>
          </div>
        </PopupCard>
      ),
      { duration: dur }
    )
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    try { await logout(); navigate('/login') }
    catch { toast.error('Failed to logout') }
  }

  function getOtherUid(convo) {
    return convo.members?.find(uid => uid !== user.uid)
  }

  const filtered = convos.filter(c => {
    const name = c.type === 'group'
      ? c.groupName || ''
      : c.memberNames?.[getOtherUid(c)] || ''
    if (!name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'unread') return (c.unreadCount?.[user.uid] || 0) > 0
    if (filter === 'groups') return c.type === 'group'
    return true
  })

  const pinned = filtered.filter(c =>  c.pinnedBy?.includes(user.uid))
  const rest   = filtered.filter(c => !c.pinnedBy?.includes(user.uid))

  return (
    <div className="app-shell" style={{ background: 'var(--bg-secondary)' }}>
      <style>{SHELL_CSS}</style>

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="desktop-sidebar hide-mobile">
        <motion.button
          onClick={() => navigate('/app/chats')}
          title="LikeChat"
          className="logo-btn"
          whileHover={{ scale: 1.1, rotate: -5 }}
          whileTap={{ scale: 0.93 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <img src="/logo.png" alt="LikeChat" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
        </motion.button>

                {NAV.map(({ id, Icon, label, path, photo }) => {
          const isActive = activeNav === id
          return (
            <motion.button
              key={id}
              onClick={() => navigate(path)}
              title={label}
              className={`nav-btn ${isActive ? 'nav-btn--active' : ''}`}
              whileHover={{ scale: 1.08, y: -1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {isActive && (
                <motion.span
                  className="nav-active-bar"
                  layoutId="sidebar-active-bar"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              {photo ? (
                user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName}
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--text-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 11, fontWeight: 800 }}>
                    {(user?.displayName || '?')[0]}
                  </div>
                )
              ) : (
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              )}
              {id === 'notifs' && notifUnread > 0 && (
                <Badge count={notifUnread} />
              )}
            </motion.button>
          )
        })}

        <div style={{ flex: 1 }} />

        <motion.button
          onClick={handleLogout}
          title="Logout"
          className="nav-btn logout-btn"
          whileHover={{ scale: 1.08, y: -1, color: 'var(--danger)' }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <SignOut size={22} />
        </motion.button>
      </aside>

      {/* ── Conversation list panel ─────────────────────────────────────── */}
      <div className={`conversation-panel ${isChatListRoute ? 'mobile-visible' : 'mobile-hidden'}`}>
        <div className="panel-header">
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Chats
          </h1>
          <div style={{ display: 'flex', gap: '6px' }}>
            <IconBtn Icon={UsersThree} title="New group" onClick={() => setShowNewGroup(true)} />
            <IconBtn Icon={NotePencil} title="New chat"  onClick={() => navigate('/app/friends')} />
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass
              size={17}
              style={{
                position: 'absolute', left: '11px', top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)', pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '0 12px 10px', flexShrink: 0 }}>
          {FILTER_TABS.map(tab => (
            <motion.button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`filter-tab ${filter === tab ? 'filter-tab--active' : ''}`}
              whileTap={{ scale: 0.95 }}
            >
              {tab}
            </motion.button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="conversation-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {pinned.length > 0 && (
            <>
              <div className="section-label">Pinned</div>
              {pinned.map(c => (
                <ConvoItem
                  key={c.id}
                  convo={c}
                  user={user}
                  presence={presence}
                  getOtherUid={getOtherUid}
                  isActive={activeConvId === c.id}
                  onClick={() => navigate(`/app/chats/${c.id}`)}
                />
              ))}
              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 12px' }} />
            </>
          )}

          {rest.length === 0 && pinned.length === 0 ? (
            <div className="empty-convos">
              <ChatCircleDots size={48} style={{ opacity: 0.25 }} />
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {search ? 'No conversations found' : 'No conversations yet'}
              </p>
              {!search && (
                <motion.button
                  onClick={() => navigate('/app/friends')}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Start a new chat →
                </motion.button>
              )}
            </div>
          ) : (
            rest.map(c => (
              <ConvoItem
                key={c.id}
                convo={c}
                user={user}
                presence={presence}
                getOtherUid={getOtherUid}
                isActive={activeConvId === c.id}
                onClick={() => navigate(`/app/chats/${c.id}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className={`chat-main ${isChatListRoute ? 'mobile-hidden' : 'mobile-visible'}`}>
        {location.pathname !== '/app/chats' ? (
          <Outlet />
        ) : (
          <div
            className="hide-mobile"
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '16px', color: 'var(--text-tertiary)',
            }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
            >
              <ChatCircleDots size={80} style={{ opacity: 0.12 }} />
            </motion.div>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select a conversation
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Choose a chat to start messaging
            </p>
          </div>
        )}
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      {showMobileNav && (
        <nav className="mobile-bottom-nav">
                    {NAV.map(({ id, Icon, path, photo }) => {
            const isActive = activeNav === id
            return (
              <motion.button
                key={id}
                onClick={() => navigate(path)}
                className={`mobile-nav-btn ${isActive ? 'mobile-nav-btn--active' : ''}`}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {photo ? (
                  user?.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName}
                      style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--text-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 11, fontWeight: 800 }}>
                      {(user?.displayName || '?')[0]}
                    </div>
                  )
                ) : (
                  <Icon size={24} weight={isActive ? 'fill' : 'regular'} />
                )}
                {id === 'notifs' && notifUnread > 0 && (
                  <Badge count={notifUnread} style={{ top: '8px', right: '18px' }} />
                )}
              </motion.button>
            )
          })}
        </nav>
      )}

      {/* ── New group modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewGroup && (
          <NewGroupModal
            user={user}
            onClose={() => setShowNewGroup(false)}
            onCreated={convId => {
              setShowNewGroup(false)
              navigate(`/app/chats/${convId}`)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ count, style }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      style={{
        position: 'absolute',
        top: '6px', right: '6px',
        minWidth: '16px', height: '16px',
        borderRadius: '999px',
        background: 'var(--danger)',
        color: '#fff',
        fontSize: '10px', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 4px',
        boxShadow: '0 0 0 2px var(--bg-primary)',
        ...style,
      }}
    >
      {count > 9 ? '9+' : count}
    </motion.span>
  )
}

function PopupCard({ children, onClick, duration = 10000 }) {
  const [progress, setProgress] = React.useState(100)

  React.useEffect(() => {
    const start = Date.now()
    let raf
    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  const barColor =
    progress > 40 ? 'var(--primary)' :
    progress > 15 ? '#f59e0b' :
                    '#ef4444'

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      style={{ ...popupStyles.card, padding: '12px 12px 0' }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1, paddingBottom: '12px' }}>
        {children}
      </div>
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '0 0 16px 16px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: barColor,
          transition: 'background 0.5s ease',
        }} />
      </div>
    </motion.div>
  )
}

function PopupIconBox({ type, callType }) {
  const iconMap = {
    group:           <UsersThree size={20} />,
    friend_request:  <UserPlus   size={20} />,
    friend_accepted: <UserPlus   size={20} />,
    reaction:        <Heart      size={20} />,
    mention:         <At         size={20} />,
    announce:        <Megaphone  size={20} />,
    call:            callType === 'video' ? <Video size={20} /> : <Phone size={20} />,
    missed_call:     callType === 'video' ? <Video size={20} /> : <Phone size={20} />,
  }
  return (
    <div style={popupStyles.icon}>
      {iconMap[type] || <Bell size={20} />}
    </div>
  )
}

function IconBtn({ Icon, title, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      title={title}
      className="icon-btn"
      whileHover={{ scale: 1.1, y: -1 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <Icon size={20} />
    </motion.button>
  )
}

function ConvoItem({ convo, user, presence, getOtherUid, isActive, onClick }) {
  const otherUid = getOtherUid(convo)
  const isGroup  = convo.type === 'group'
  const name     = isGroup ? convo.groupName : convo.memberNames?.[otherUid] || 'Unknown'
  const photo    = isGroup ? convo.groupPhoto : convo.memberPhotos?.[otherUid]
  const unread   = convo.unreadCount?.[user.uid] || 0
  const lastMsg  = convo.lastMessage
  const isOnline = !isGroup && presence[otherUid]?.status === 'online'
  const ac       = getAvatarColor(name)

  function getPreview() {
    if (!lastMsg?.text && !lastMsg?.type) return 'No messages yet'
    if (lastMsg.unsent) return 'Message unsent'
    if (lastMsg.type === 'image') return 'Photo'
    if (lastMsg.type === 'video') return 'Video'
    if (lastMsg.type === 'file')  return 'File'
    return lastMsg.text || 'No messages yet'
  }

  return (
    <motion.button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
        background: isActive ? 'var(--primary-light)' : 'transparent',
        position: 'relative',
      }}
      whileHover={{
        backgroundColor: isActive ? 'var(--primary-light)' : 'var(--bg-secondary)',
        x: 2,
      }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {photo ? (
          <img src={photo} alt={name} style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '46px', height: '46px', borderRadius: '50%',
            background: ac.bg, color: ac.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '16px',
          }}>
            {getInitials(name)}
          </div>
        )}
        {!isGroup && (
          <span style={{
            position: 'absolute', bottom: '1px', right: '1px',
            width: '12px', height: '12px', borderRadius: '50%',
            border: '2px solid var(--bg-primary)',
            background: isOnline ? 'var(--online)' : 'var(--offline)',
          }} />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
          <span style={{
            fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
          {lastMsg?.timestamp && (
            <span style={{
              fontSize: '11px', flexShrink: 0, marginLeft: '6px',
              color: unread > 0 ? 'var(--primary)' : 'var(--text-tertiary)',
              fontWeight: unread > 0 ? 600 : 400,
            }}>
              {formatTime(lastMsg.timestamp)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, fontWeight: unread > 0 ? 500 : 400,
            color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          }}>
            {lastMsg?.senderId === user.uid && (
              <span style={{ color: 'var(--text-tertiary)' }}>You: </span>
            )}
            {getPreview()}
          </span>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              style={{
                minWidth: '19px', height: '19px', borderRadius: '10px',
                background: 'var(--primary)', color: '#fff',
                fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px', flexShrink: 0, marginLeft: '6px',
              }}
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ─── New Group Modal ──────────────────────────────────────────────────────────

function NewGroupModal({ user, onClose, onCreated }) {
  const [groupName, setGroupName] = useState('')
  const [searchQ,   setSearchQ]   = useState('')
  const [results,   setResults]   = useState([])
  const [selected,  setSelected]  = useState([])
  const [searching, setSearching] = useState(false)
  const [creating,  setCreating]  = useState(false)

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await searchByUsername(q.trim())
      setResults((res || []).filter(u => u.uid !== user.uid))
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  function toggle(u) {
    setSelected(prev =>
      prev.find(s => s.uid === u.uid)
        ? prev.filter(s => s.uid !== u.uid)
        : [...prev, u]
    )
  }

  async function handleCreate() {
    if (!groupName.trim()) return toast.error('Enter a group name')
    if (!selected.length)  return toast.error('Add at least one member')
    setCreating(true)
    try {
      const names  = { [user.uid]: user.displayName || '' }
      const photos = { [user.uid]: user.photoURL    || '' }
      selected.forEach(u => {
        names[u.uid]  = u.displayName || ''
        photos[u.uid] = u.photoURL    || ''
      })
      const convId = await createGroupConv(
        user.uid, groupName.trim(), selected.map(u => u.uid), names, photos
      )
      onCreated(convId)
      toast.success('Group created!')
    } catch {
      toast.error('Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  const isDisabled = creating || !groupName.trim() || selected.length === 0

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            New Group
          </h3>
          <motion.button
            onClick={onClose}
            className="modal-close"
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <X size={16} />
          </motion.button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="field-label">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. College Friends"
              maxLength={60}
              className="field-input"
              onFocus={e  => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e   => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label className="field-label">Add Members</label>
            <input
              type="text"
              value={searchQ}
              onChange={handleSearch}
              placeholder="Search by username..."
              className="field-input"
              style={{ marginBottom: '8px' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
            />

            <AnimatePresence>
              {selected.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', overflow: 'hidden' }}
                >
                  {selected.map(u => (
                    <motion.span
                      key={u.uid}
                      className="member-tag"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    >
                      {u.displayName || u.username || 'Member'}
                      <button onClick={() => toggle(u)} className="member-tag-remove">
                        <X size={12} />
                      </button>
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {searching && (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '16px', fontSize: '13px', margin: 0 }}>
                  Searching...
                </p>
              )}
              {!searching && searchQ.trim() && results.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '16px', fontSize: '13px', margin: 0 }}>
                  No users found
                </p>
              )}
              {results.map(u => {
                const isSelected = !!selected.find(s => s.uid === u.uid)
                const ac = getAvatarColor(u.displayName || u.username || '')
                return (
                  <motion.button
                    key={u.uid}
                    onClick={() => toggle(u)}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 10px', borderRadius: '10px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary-light)' : 'var(--bg-secondary)',
                      cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: ac.bg, flexShrink: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: ac.text, fontSize: '14px', fontWeight: 700 }}>
                          {getInitials(u.displayName || u.username || '?')}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {u.displayName || 'Unknown'}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        @{u.username || u.uid?.slice(0, 8)}
                      </p>
                    </div>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        >
                          <CheckCircle size={20} weight="fill" style={{ color: 'var(--primary)' }} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )
              })}
            </div>
          </div>

          <motion.button
            onClick={handleCreate}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.02, y: -1 } : {}}
            whileTap={!isDisabled ? { scale: 0.97 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              background: isDisabled ? 'var(--border)' : 'var(--primary)',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {creating ? 'Creating...' : `Create Group (${selected.length + 1} members)`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const popupStyles = {
  card: {
    width: 'min(360px, calc(100vw - 24px))',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    boxShadow: '0 14px 40px rgba(0,0,0,0.22)',
    display: 'flex',
    flexDirection: 'column',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    overflow: 'hidden',
  },
  icon: {
    width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
    background: 'var(--primary-light)', color: 'var(--primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: '14px', fontWeight: 800, marginBottom: '3px' },
  body:  { fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 },
  btnRow: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
  primaryBtn: {
    border: 'none', background: 'var(--primary)', color: '#fff',
    borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
  },
  secondaryBtn: {
    border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
  },
}

const SHELL_CSS = `
  .app-shell {
    display: flex;
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
    position: relative;
  }

  .desktop-sidebar {
    width: 64px;
    flex-shrink: 0;
    background: var(--bg-primary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 4px;
  }

  .logo-btn {
    width: 40px; height: 40px;
    border-radius: 12px;
    background: var(--primary);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 12px;
    color: #fff;
    box-shadow: 0 4px 14px rgba(30,144,255,0.3);
  }

  .nav-btn {
    width: 44px; height: 44px;
    border-radius: 12px;
    border: none; cursor: pointer;
    background: transparent;
    color: var(--text-tertiary);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .nav-btn--active {
    background: var(--primary-light);
    color: var(--primary);
  }

  .nav-active-bar {
    position: absolute;
    left: 0; top: 28%; bottom: 28%;
    width: 3px;
    background: var(--primary);
    border-radius: 0 3px 3px 0;
    box-shadow: 0 0 8px rgba(30,144,255,0.5);
  }

  .conversation-panel {
    width: 320px;
    flex-shrink: 0;
    background: var(--bg-primary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .panel-header {
    padding: 14px 16px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    transition: border-color 0.18s, box-shadow 0.18s;
    box-sizing: border-box;
  }
  .search-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(30,144,255,0.1);
  }

  .filter-tab {
    padding: 5px 12px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-tertiary);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: capitalize;
  }

  .filter-tab--active {
    border-color: var(--primary);
    background: var(--primary);
    color: #fff;
  }

  .section-label {
    padding: 8px 16px 4px;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.6px;
    color: var(--text-tertiary);
  }

  .empty-convos {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 200px; gap: 12px;
    color: var(--text-tertiary);
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-secondary);
    min-width: 0;
  }

  .icon-btn {
    width: 34px; height: 34px;
    border-radius: 9px; border: none;
    background: transparent; color: var(--text-tertiary);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover {
    background: var(--bg-secondary);
    color: var(--primary);
  }

  .mobile-bottom-nav { display: none; }
  .hide-mobile { display: flex; }

  .field-label {
    display: block; font-size: 12px; font-weight: 600;
    margin-bottom: 6px; color: var(--text-secondary);
  }

  .field-input {
    width: 100%; padding: 10px 12px;
    border-radius: 10px; border: 1px solid var(--border);
    background: var(--bg-secondary); color: var(--text-primary);
    font-size: 14px; outline: none;
    box-sizing: border-box;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .field-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(30,144,255,0.1);
  }

  .member-tag {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; border-radius: 20px;
    background: var(--primary-light); color: var(--primary);
    font-size: 12px; font-weight: 500;
  }

  .member-tag-remove {
    background: none; border: none; cursor: pointer;
    color: var(--primary); display: flex; align-items: center; justify-content: center;
    padding: 0; opacity: 0.7; transition: opacity 0.15s;
  }
  .member-tag-remove:hover { opacity: 1; }

  @media (max-width: 900px) {
    .hide-mobile { display: none !important; }

    .app-shell {
      display: block;
      position: relative;
    }

    .conversation-panel,
    .chat-main {
      position: fixed;
      inset: 0;
      width: 100vw !important;
      height: 100dvh;
      border-right: none !important;
      transform: translateX(100%);
      transition: transform 0.24s ease;
      will-change: transform;
    }

    .conversation-panel.mobile-visible  { transform: translateX(0);    z-index: 20; }
    .conversation-panel.mobile-hidden   { transform: translateX(-100%); pointer-events: none; z-index: 10; }
    .chat-main.mobile-visible           { transform: translateX(0);     z-index: 15; }
    .chat-main.mobile-hidden            { transform: translateX(100%);  pointer-events: none; z-index: 10; }

    .conversation-scroll {
      padding-bottom: calc(72px + env(safe-area-inset-bottom));
    }

    .chat-main {
      padding-bottom: calc(56px + env(safe-area-inset-bottom));
    }

    .mobile-bottom-nav {
      display: flex !important;
      position: fixed; left: 0; right: 0; bottom: 0;
      z-index: 60; height: 56px;
      background: var(--bg-primary);
      border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom);
    }

    .mobile-nav-btn {
      flex: 1; border: none; background: transparent;
      color: var(--text-tertiary);
      display: flex; align-items: center; justify-content: center;
      height: 56px; cursor: pointer; position: relative;
      transition: color 0.15s;
      border-top: 2px solid transparent;
    }

    .mobile-nav-btn--active {
      color: var(--primary);
      border-top-color: var(--primary);
    }
  }
`