// src/pages/app/AppShell.jsx
import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { onSnapshot, collection, query, orderBy } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { watchConversations, createGroupConv, acceptGroupInvite } from '../../services/chatService'
import { watchUserPresence } from '../../lib/presence'
import { formatTime, getInitials, getAvatarColor } from '../../lib/utils'
import { logout } from '../../services/authService'
import { searchByUsername } from '../../services/userService'
import { deleteNotification } from '../../services/notificationService'
import { db } from '../../lib/firebase'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────────────────────

const NAV = [
  { id: 'chats',   icon: 'chat_bubble',    label: 'Chats',         path: '/app/chats' },
  { id: 'friends', icon: 'people',         label: 'Friends',       path: '/app/friends' },
  { id: 'notifs',  icon: 'notifications',  label: 'Notifications', path: '/app/notifications' },
  { id: 'profile', icon: 'account_circle', label: 'Profile',       path: '/app/profile' },
]

const FILTER_TABS = ['all', 'unread', 'groups']

// ─── AppShell ────────────────────────────────────────────────────────────────

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

  const notifSeenRef  = useRef(new Set())
  const notifBootedRef = useRef(false)

  const isChatListRoute  = location.pathname === '/app/chats'
  const isChatThreadRoute = /^\/app\/chats\/[^/]+/.test(location.pathname)
  const showMobileNav    = !isChatThreadRoute
  const activeConvId     = location.pathname.match(/\/app\/chats\/(.+)/)?.[1]

  const activeNav = (() => {
    if (location.pathname.startsWith('/app/friends'))      return 'friends'
    if (location.pathname.startsWith('/app/notifications')) return 'notifs'
    if (location.pathname.startsWith('/app/profile'))      return 'profile'
    return 'chats'
  })()

  // ── Watch conversations ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    return watchConversations(user.uid, setConvos)
  }, [user?.uid])

  // ── Watch presence for all conversation partners ───────────────────────────
  useEffect(() => {
    if (!convos.length || !user?.uid) return

    const uids = [
      ...new Set(
        convos.flatMap(c => c.members ?? []).filter(uid => uid !== user.uid)
      ),
    ]

    const unsubs = uids.map(uid =>
      watchUserPresence(uid, data =>
        setPresence(prev => ({ ...prev, [uid]: data }))
      )
    )

    return () => unsubs.forEach(fn => fn())
  }, [convos, user?.uid])

  // ── Watch notifications (badge + popup toasts) ─────────────────────────────
  useEffect(() => {
    if (!user?.uid) return

    const q = query(
      collection(db, 'notifications', user.uid, 'items'),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setNotifUnread(items.filter(n => !n.read).length)

      // On first load, seed the "seen" set so we don't re-toast existing notifs
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

      // Keep seen set current
      items.forEach(n => notifSeenRef.current.add(n.id))
    })

    return () => unsub()
  }, [user?.uid])

  // ── Popup notification toast ───────────────────────────────────────────────
  function showPopupNotif(notif) {
    const name = notif.fromName || 'Someone'

    if (notif.type === 'group_invite') {
      toast.custom(
        t => (
          <PopupCard>
            <PopupIcon icon="group" />
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
        { duration: 7000 }
      )
      return
    }

    const openLabel =
      notif.type === 'friend_request' ? 'Open friends' : 'Open chat'

    const body =
      notif.type === 'friend_request' ? 'You have a new friend request.' :
      notif.type === 'reaction'       ? `${name} reacted to your message.` :
      notif.type === 'media'          ? `${name} sent media in a chat.` :
                                        notif.text || `${name} sent you a message.`

    function handleOpen() {
      toast.dismiss()
      if (notif.type === 'friend_request') navigate('/app/friends')
      else if (notif.convId) navigate(`/app/chats/${notif.convId}`)
      else navigate('/app/notifications')
    }

    toast.custom(
      t => (
        <PopupCard onClick={handleOpen}>
          <PopupIcon icon="notifications" />
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
      { duration: 5000 }
    )
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    try {
      await logout()
      navigate('/login')
    } catch {
      toast.error('Failed to logout')
    }
  }

  function getOtherUid(convo) {
    return convo.members?.find(uid => uid !== user.uid)
  }

  // ── Filtered + pinned/rest split ───────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell" style={{ background: 'var(--bg-secondary)' }}>
      <style>{SHELL_CSS}</style>

      {/* Desktop sidebar */}
      <aside className="desktop-sidebar hide-mobile">
        {/* Logo / home button */}
        <button
          onClick={() => navigate('/app/chats')}
          title="LikeChat"
          className="logo-btn"
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08) rotate(-4deg)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <img src="/logo.png" alt="LikeChat" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
        </button>

        {/* Nav items */}
        {NAV.map(({ id, icon, label, path }) => {
          const isActive = activeNav === id
          return (
            <button
              key={id}
              onClick={() => navigate(path)}
              title={label}
              className={`nav-btn ${isActive ? 'nav-btn--active' : ''}`}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-secondary)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }
              }}
            >
              {isActive && <span className="nav-active-bar" />}
              <span className="material-icons" style={{ fontSize: '22px' }}>{icon}</span>
              {id === 'notifs' && notifUnread > 0 && (
                <Badge count={notifUnread} />
              )}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="nav-btn logout-btn"
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-secondary)'
            e.currentTarget.style.color = 'var(--danger)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <span className="material-icons" style={{ fontSize: '22px' }}>logout</span>
        </button>
      </aside>

      {/* Conversation list panel */}
      <div className={`conversation-panel ${isChatListRoute ? 'mobile-visible' : 'mobile-hidden'}`}>
        {/* Panel header */}
        <div className="panel-header">
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Chats
          </h1>
          <div style={{ display: 'flex', gap: '6px' }}>
            <IconBtn icon="group_add" title="New group" onClick={() => setShowNewGroup(true)} />
            <IconBtn icon="edit"      title="New chat"  onClick={() => navigate('/app/friends')} />
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span
              className="material-icons"
              style={{
                position: 'absolute', left: '10px', top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)', fontSize: '18px', pointerEvents: 'none',
              }}
            >
              search
            </span>
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
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`filter-tab ${filter === tab ? 'filter-tab--active' : ''}`}
            >
              {tab}
            </button>
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
              <span className="material-icons" style={{ fontSize: '48px', opacity: 0.3 }}>
                chat_bubble_outline
              </span>
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {search ? 'No conversations found' : 'No conversations yet'}
              </p>
              {!search && (
                <button
                  onClick={() => navigate('/app/friends')}
                  style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  Start a new chat →
                </button>
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

      {/* Main content area */}
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
            <span className="material-icons" style={{ fontSize: '80px', opacity: 0.15 }}>
              mark_unread_chat_alt
            </span>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select a conversation
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Choose a chat to start messaging
            </p>
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      {showMobileNav && (
        <nav className="mobile-bottom-nav">
          {NAV.map(({ id, icon, path }) => {
            const isActive = activeNav === id
            return (
              <button
                key={id}
                onClick={() => navigate(path)}
                className={`mobile-nav-btn ${isActive ? 'mobile-nav-btn--active' : ''}`}
              >
                <span className="material-icons" style={{ fontSize: '24px' }}>{icon}</span>
                {id === 'notifs' && notifUnread > 0 && (
                  <Badge count={notifUnread} style={{ top: '8px', right: '18px' }} />
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* New group modal */}
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
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Small notification badge */
function Badge({ count, style }) {
  return (
    <span
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
    </span>
  )
}

/** Wrapper for popup toast cards */
function PopupCard({ children, onClick }) {
  return (
    <div style={popupStyles.card} onClick={onClick}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

/** Icon pill inside popup toast */
function PopupIcon({ icon }) {
  return (
    <div style={popupStyles.icon}>
      <span className="material-icons" style={{ fontSize: '20px' }}>{icon}</span>
    </div>
  )
}

/** Small icon-only button used in panel header */
function IconBtn({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="icon-btn"
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-secondary)'
        e.currentTarget.style.color = 'var(--primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-tertiary)'
      }}
    >
      <span className="material-icons" style={{ fontSize: '20px' }}>{icon}</span>
    </button>
  )
}

/** Single conversation row */
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
    if (lastMsg.type === 'image') return '📷 Photo'
    if (lastMsg.type === 'video') return '🎥 Video'
    if (lastMsg.type === 'file')  return '📎 File'
    return lastMsg.text || 'No messages yet'
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
        background: isActive ? 'var(--primary-light)' : 'transparent',
        transition: 'background 0.1s', position: 'relative',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
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

      {/* Text content */}
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
            <span style={{
              minWidth: '19px', height: '19px', borderRadius: '10px',
              background: 'var(--primary)', color: '#fff',
              fontSize: '11px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 5px', flexShrink: 0, marginLeft: '6px',
            }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
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
        user.uid,
        groupName.trim(),
        selected.map(u => u.uid),
        names,
        photos
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            New Group
          </h3>
          <button onClick={onClose} className="modal-close">
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Group name */}
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

          {/* Member search */}
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

            {/* Selected tags */}
            {selected.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {selected.map(u => (
                  <span key={u.uid} className="member-tag">
                    {u.displayName || u.username || 'Member'}
                    <button onClick={() => toggle(u)} className="member-tag-remove">×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Results list */}
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
                  <button
                    key={u.uid}
                    onClick={() => toggle(u)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 10px', borderRadius: '10px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary-light)' : 'var(--bg-secondary)',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
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

                    {isSelected && (
                      <span className="material-icons" style={{ color: 'var(--primary)', fontSize: '20px' }}>
                        check_circle
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={isDisabled}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              background: isDisabled ? 'var(--border)' : 'var(--primary)',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {creating ? 'Creating...' : `Create Group (${selected.length + 1} members)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const popupStyles = {
  card: {
    width: 'min(360px, calc(100vw - 24px))',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    boxShadow: '0 14px 40px rgba(0,0,0,0.18)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
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

  /* Desktop sidebar */
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
    transition: transform 0.2s;
  }

  .nav-btn {
    width: 44px; height: 44px;
    border-radius: 12px;
    border: none; cursor: pointer;
    background: transparent;
    color: var(--text-tertiary);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: all 0.15s ease;
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
  }

  /* Conversation panel */
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
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: var(--primary); }

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

  /* Main content */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-secondary);
    min-width: 0;
  }

  /* Icon button */
  .icon-btn {
    width: 34px; height: 34px;
    border-radius: 9px; border: none;
    background: transparent; color: var(--text-tertiary);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }

  /* Mobile bottom nav — hidden on desktop */
  .mobile-bottom-nav { display: none; }

  .hide-mobile { display: flex; }

  /* Utility */
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
  }

  .member-tag {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; border-radius: 20px;
    background: var(--primary-light); color: var(--primary);
    font-size: 12px; font-weight: 500;
  }

  .member-tag-remove {
    background: none; border: none; cursor: pointer;
    color: var(--primary); font-size: 14px; line-height: 1; padding: 0;
  }

  /* ── Mobile ──────────────────────────────────────────────── */
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