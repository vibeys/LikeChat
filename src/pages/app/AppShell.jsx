// src/pages/app/AppShell.jsx
import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { onSnapshot, collection, query, orderBy } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { watchConversations, createGroupConv } from '../../services/chatService'
import { watchUserPresence } from '../../lib/presence'
import { formatTime, getInitials, getAvatarColor } from '../../lib/utils'
import { logout } from '../../services/authService'
import { searchByUsername } from '../../services/userService'
import {
  deleteNotification,
} from '../../services/notificationService'
import { acceptGroupInvite } from '../../services/chatService'
import { db } from '../../lib/firebase'
import toast from 'react-hot-toast'

const NAV = [
  { id: 'chats', icon: 'chat_bubble', label: 'Chats', path: '/app/chats' },
  { id: 'friends', icon: 'people', label: 'Friends', path: '/app/friends' },
  { id: 'notifs', icon: 'notifications', label: 'Notifications', path: '/app/notifications' },
  { id: 'profile', icon: 'account_circle', label: 'Profile', path: '/app/profile' },
]

export default function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [convos, setConvos] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [presence, setPresence] = useState({})
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [notifUnread, setNotifUnread] = useState(0)

  const notifSeenRef = useRef(new Set())
  const notifBootedRef = useRef(false)

  const isChatListRoute = location.pathname === '/app/chats'
  const isChatThreadRoute = /^\/app\/chats\/[^/]+/.test(location.pathname)

  const activeNav = (() => {
    if (location.pathname.startsWith('/app/friends')) return 'friends'
    if (location.pathname.startsWith('/app/notifications')) return 'notifs'
    if (location.pathname.startsWith('/app/profile')) return 'profile'
    return 'chats'
  })()

  useEffect(() => {
    if (!user?.uid) return
    return watchConversations(user.uid, setConvos)
  }, [user?.uid])

  useEffect(() => {
    if (!convos.length || !user?.uid) return

    const uids = [
      ...new Set(
        convos.flatMap(c => c.members ?? []).filter(uid => uid !== user.uid)
      ),
    ]

    const unsubs = uids.map(uid =>
      watchUserPresence(uid, data => setPresence(prev => ({ ...prev, [uid]: data })))
    )

    return () => unsubs.forEach(fn => fn())
  }, [convos, user?.uid])

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

        if (notif.read) return
        showPopupNotif(notif)
      })

      items.forEach(n => notifSeenRef.current.add(n.id))
    })

    return () => unsub()
  }, [user?.uid])

  function showPopupNotif(notif) {
    const name = notif.fromName || 'Someone'

    if (notif.type === 'group_invite') {
      toast.custom(
        t => (
          <div
            style={{
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
            }}
            onClick={() => {
              if (notif.convId) navigate(`/app/notifications`)
              toast.dismiss(t.id)
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span className="material-icons" style={{ fontSize: '20px' }}>
                  group
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '3px' }}>
                  {notif.title || `${name} invited you to a group`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  {notif.text || `Join "${notif.groupName || 'this group'}"`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
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
                style={{
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Join
              </button>

              <button
                onClick={e => {
                  e.stopPropagation()
                  toast.dismiss(t.id)
                }}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Later
              </button>
            </div>
          </div>
        ),
        { duration: 7000 }
      )
      return
    }

    const openLabel =
      notif.type === 'friend_request' ? 'Open friends' :
      notif.type === 'reaction' ? 'Open chat' :
      notif.type === 'media' ? 'Open chat' :
      'Open'

    const body =
      notif.type === 'friend_request'
        ? 'You have a new friend request.'
        : notif.type === 'reaction'
          ? `${name} reacted to your message.`
          : notif.type === 'media'
            ? `${name} sent media in a chat.`
            : notif.text || `${name} sent you a message.`

    toast.custom(
      t => (
        <div
          style={{
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
          }}
          onClick={() => {
            toast.dismiss(t.id)
            if (notif.type === 'friend_request') navigate('/app/friends')
            else if (notif.convId) navigate(`/app/chats/${notif.convId}`)
            else navigate('/app/notifications')
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-icons" style={{ fontSize: '20px' }}>
                notifications
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '3px' }}>
                {notif.title || name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                {body}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={e => {
                e.stopPropagation()
                toast.dismiss(t.id)
                if (notif.type === 'friend_request') navigate('/app/friends')
                else if (notif.convId) navigate(`/app/chats/${notif.convId}`)
                else navigate('/app/notifications')
              }}
              style={{
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {openLabel}
            </button>
          </div>
        </div>
      ),
      { duration: 5000 }
    )
  }

  async function handleLogout() {
    try {
      await logout()
      navigate('/login')
    } catch {
      toast.error('Failed to logout')
    }
  }

  function getOtherUid(c) {
    return c.members?.find(uid => uid !== user.uid)
  }

  const filtered = convos.filter(c => {
    const name = c.type === 'group' ? c.groupName : c.memberNames?.[getOtherUid(c)] || ''
    if (!name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'unread') return (c.unreadCount?.[user.uid] || 0) > 0
    if (filter === 'groups') return c.type === 'group'
    return true
  })

  const pinned = filtered.filter(c => c.pinnedBy?.includes(user.uid))
  const rest = filtered.filter(c => !c.pinnedBy?.includes(user.uid))

  const activeConvId = location.pathname.match(/\/app\/chats\/(.+)/)?.[1]
  const showMobileNav = !isChatThreadRoute

  return (
    <div className="app-shell" style={{ background: 'var(--bg-secondary)' }}>
      <style>{`
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

        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-secondary);
          min-width: 0;
        }

        .mobile-bottom-nav {
          display: none;
        }

        .hide-mobile {
          display: flex;
        }

        @media (max-width: 900px) {
          .hide-mobile {
            display: none !important;
          }

          .app-shell {
            display: block;
            width: 100vw;
            height: 100dvh;
            overflow: hidden;
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

          .conversation-panel.mobile-visible {
            transform: translateX(0);
            z-index: 20;
          }

          .conversation-panel.mobile-hidden {
            transform: translateX(-100%);
            pointer-events: none;
            z-index: 10;
          }

          .chat-main.mobile-visible {
            transform: translateX(0);
            z-index: 15;
          }

          .chat-main.mobile-hidden {
            transform: translateX(100%);
            pointer-events: none;
            z-index: 10;
          }

          .conversation-scroll {
            padding-bottom: calc(72px + env(safe-area-inset-bottom));
          }

          .chat-main {
            padding-bottom: calc(56px + env(safe-area-inset-bottom));
          }

          .mobile-bottom-nav {
            display: flex !important;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 60;
            height: 56px;
            background: var(--bg-primary);
            border-top: 1px solid var(--border);
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
      `}</style>

      <aside className="desktop-sidebar hide-mobile">
        <button
          onClick={() => navigate('/app/chats')}
          title="LikeChat"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            transition: 'transform 0.2s',
            padding: '4px',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08) rotate(-4deg)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <img src="/logo.png" alt="LikeChat" style={{ width: '32px', height: 'auto' }} />
        </button>

        {NAV.map(({ id, icon, label, path }) => {
          const isActive = activeNav === id

          return (
            <button
              key={id}
              onClick={() => navigate(path)}
              title={label}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.15s ease',
              }}
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
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '28%',
                    bottom: '28%',
                    width: '3px',
                    background: 'var(--primary)',
                    borderRadius: '0 3px 3px 0',
                  }}
                />
              )}

              <span className="material-icons" style={{ fontSize: '22px' }}>
                {icon}
              </span>

              {id === 'notifs' && notifUnread > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    boxShadow: '0 0 0 2px var(--bg-primary)',
                  }}
                >
                  {notifUnread > 9 ? '9+' : notifUnread}
                </span>
              )}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleLogout}
          title="Logout"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-secondary)'
            e.currentTarget.style.color = 'var(--danger)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <span className="material-icons" style={{ fontSize: '22px' }}>
            logout
          </span>
        </button>
      </aside>

      <div className={`conversation-panel ${isChatListRoute ? 'mobile-visible' : 'mobile-hidden'}`}>
        <div
          style={{
            padding: '14px 16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Chats
          </h1>
          <div style={{ display: 'flex', gap: '6px' }}>
            <IconBtn icon="group_add" title="New group" onClick={() => setShowNewGroup(true)} />
            <IconBtn icon="edit" title="New chat" onClick={() => navigate('/app/friends')} />
          </div>
        </div>

        <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span
              className="material-icons"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
                fontSize: '18px',
                pointerEvents: 'none',
              }}
            >
              search
            </span>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', padding: '0 12px 10px', flexShrink: 0 }}>
          {['all', 'unread', 'groups'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '5px 12px',
                borderRadius: '7px',
                border: '1px solid',
                borderColor: filter === tab ? 'var(--primary)' : 'var(--border)',
                background: filter === tab ? 'var(--primary)' : 'transparent',
                color: filter === tab ? '#fff' : 'var(--text-tertiary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="conversation-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {pinned.length > 0 && (
            <>
              <div
                style={{
                  padding: '8px 16px 4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: 'var(--text-tertiary)',
                }}
              >
                Pinned
              </div>

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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '200px',
                gap: '12px',
                color: 'var(--text-tertiary)',
              }}
            >
              <span
                className="material-icons"
                style={{ fontSize: '48px', opacity: 0.3 }}
              >
                chat_bubble_outline
              </span>
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                {search ? 'No conversations found' : 'No conversations yet'}
              </p>
              {!search && (
                <button
                  onClick={() => navigate('/app/friends')}
                  style={{
                    color: 'var(--primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
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

      <div className={`chat-main ${isChatListRoute ? 'mobile-hidden' : 'mobile-visible'}`}>
        {location.pathname !== '/app/chats' ? (
          <Outlet />
        ) : (
          <div
            className="hide-mobile"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              color: 'var(--text-tertiary)',
            }}
          >
            <span
              className="material-icons"
              style={{ fontSize: '80px', opacity: 0.15 }}
            >
              mark_unread_chat_alt
            </span>
            <p
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              Select a conversation
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Choose a chat to start messaging
            </p>
          </div>
        )}
      </div>

      {showMobileNav && (
        <nav className="mobile-bottom-nav">
          {NAV.map(({ id, icon, path }) => {
            const isActive = activeNav === id
            return (
              <button
                key={id}
                onClick={() => navigate(path)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '56px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'color 0.15s',
                  borderTop: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                <span className="material-icons" style={{ fontSize: '24px' }}>
                  {icon}
                </span>

                {id === 'notifs' && notifUnread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '18px',
                      minWidth: '16px',
                      height: '16px',
                      borderRadius: '999px',
                      background: 'var(--danger)',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      boxShadow: '0 0 0 2px var(--bg-primary)',
                    }}
                  >
                    {notifUnread > 9 ? '9+' : notifUnread}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      )}

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

/* ── Icon button helper ── */
function IconBtn({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '9px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-secondary)'
        e.currentTarget.style.color = 'var(--primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-tertiary)'
      }}
    >
      <span className="material-icons" style={{ fontSize: '20px' }}>
        {icon}
      </span>
    </button>
  )
}

/* ── Conversation item ── */
function ConvoItem({ convo, user, presence, getOtherUid, isActive, onClick }) {
  const otherUid = getOtherUid(convo)
  const isGroup = convo.type === 'group'
  const name = isGroup ? convo.groupName : convo.memberNames?.[otherUid] || 'Unknown'
  const photo = isGroup ? convo.groupPhoto : convo.memberPhotos?.[otherUid]
  const unread = convo.unreadCount?.[user.uid] || 0
  const lastMsg = convo.lastMessage
  const isOnline = presence[otherUid]?.status === 'online'
  const ac = getAvatarColor(name)

  function preview() {
    if (!lastMsg?.text && !lastMsg?.type) return 'No messages yet'
    if (lastMsg.unsent) return 'Message unsent'
    if (lastMsg.type === 'image') return '📷 Photo'
    if (lastMsg.type === 'video') return '🎥 Video'
    if (lastMsg.type === 'file') return '📎 File'
    return lastMsg.text || 'No messages yet'
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 14px',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        background: isActive ? 'var(--primary-light)' : 'transparent',
        transition: 'background 0.1s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {photo ? (
          <img
            src={photo}
            alt={name}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: ac.bg,
              color: ac.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '16px',
            }}
          >
            {getInitials(name)}
          </div>
        )}

        {!isGroup && (
          <span
            style={{
              position: 'absolute',
              bottom: '1px',
              right: '1px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '2px solid var(--bg-primary)',
              background: isOnline ? 'var(--online)' : 'var(--offline)',
            }}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
          {lastMsg?.timestamp && (
            <span
              style={{
                fontSize: '11px',
                color: unread > 0 ? 'var(--primary)' : 'var(--text-tertiary)',
                flexShrink: 0,
                marginLeft: '6px',
                fontWeight: unread > 0 ? 600 : 400,
              }}
            >
              {formatTime(lastMsg.timestamp)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '12px',
              color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              fontWeight: unread > 0 ? 500 : 400,
            }}
          >
            {lastMsg?.senderId === user.uid && (
              <span style={{ color: 'var(--text-tertiary)' }}>You: </span>
            )}
            {preview()}
          </span>

          {unread > 0 && (
            <span
              style={{
                minWidth: '19px',
                height: '19px',
                borderRadius: '10px',
                background: 'var(--primary)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                flexShrink: 0,
                marginLeft: '6px',
              }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/* ── New Group Modal ── */
function NewGroupModal({ user, onClose, onCreated }) {
  const [groupName, setGroupName] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleSearch = async e => {
    const q = e.target.value
    setSearchQ(q)

    if (!q.trim()) {
      setResults([])
      return
    }

    setSearching(true)
    try {
      const res = await searchByUsername(q.trim())
      setResults(res.filter(u => u.uid !== user.uid))
    } finally {
      setSearching(false)
    }
  }

  const toggle = u =>
    setSelected(prev =>
      prev.find(s => s.uid === u.uid)
        ? prev.filter(s => s.uid !== u.uid)
        : [...prev, u]
    )

  const handleCreate = async () => {
    if (!groupName.trim()) return toast.error('Enter a group name')
    if (selected.length < 1) return toast.error('Add at least one member')

    setCreating(true)
    try {
      const names = { [user.uid]: user.displayName || '' }
      const photos = { [user.uid]: user.photoURL || '' }

      selected.forEach(u => {
        names[u.uid] = u.displayName || ''
        photos[u.uid] = u.photoURL || ''
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

  const ac = getAvatarColor

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ color: 'var(--text-primary)' }}>New Group</h3>
          <button onClick={onClose} className="modal-close">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. College Friends"
              maxLength={60}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              Add Members
            </label>

            <input
              type="text"
              value={searchQ}
              onChange={handleSearch}
              placeholder="Search by username..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '8px',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />

            {selected.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {selected.map(u => (
                  <span
                    key={u.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '20px',
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    {u.displayName}
                    <button
                      onClick={() => toggle(u)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--primary)',
                        fontSize: '14px',
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {searching && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    padding: '16px',
                    fontSize: '13px',
                  }}
                >
                  Searching...
                </p>
              )}

              {!searching && results.length === 0 && searchQ && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    padding: '16px',
                    fontSize: '13px',
                  }}
                >
                  No users found
                </p>
              )}

              {results.map(u => {
                const isSelected = !!selected.find(s => s.uid === u.uid)
                const c = ac(u.displayName || '')

                return (
                  <button
                    key={u.uid}
                    onClick={() => toggle(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary-light)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: c.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt={u.displayName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span
                          style={{
                            color: c.text,
                            fontSize: '14px',
                            fontWeight: 700,
                          }}
                        >
                          {getInitials(u.displayName)}
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '14px',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {u.displayName}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        @{u.username}
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

          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selected.length === 0}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background:
                creating || !groupName.trim() || selected.length === 0
                  ? 'var(--border)'
                  : 'var(--primary)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
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