// src/pages/app/ChatList.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { watchConversations, createGroupConv } from '../../services/chatService'
import { watchUserPresence } from '../../lib/presence'
import { formatTime, getInitials, getAvatarColor } from '../../lib/utils'
import { searchByUsername } from '../../services/userService'
import { logout } from '../../services/authService'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { id: 'chats', icon: 'chat_bubble', label: 'Chats', path: '/app/chats' },
  { id: 'friends', icon: 'people', label: 'Friends', path: '/app/friends' },
  { id: 'notifs', icon: 'notifications_active', label: 'Notifications', path: '/app/notifications' },
  { id: 'profile', icon: 'account_circle', label: 'Profile', path: '/app/profile' },
]

export default function ChatList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [convos, setConvos] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [presence, setPresence] = useState({})
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [loading, setLoading] = useState(true)

  const activeNav = useMemo(() => {
    if (location.pathname.startsWith('/app/friends')) return 'friends'
    if (location.pathname.startsWith('/app/notifications')) return 'notifs'
    if (location.pathname.startsWith('/app/profile')) return 'profile'
    return 'chats'
  }, [location.pathname])

  useEffect(() => {
    if (!user?.uid) return

    setLoading(true)
    const unsub = watchConversations(user.uid, data => {
      setConvos(data || [])
      setLoading(false)
    })

    return () => unsub?.()
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || !convos.length) return

    const uids = [...new Set(
      convos.flatMap(c => c.members ?? []).filter(uid => uid !== user.uid)
    )]

    const unsubs = uids.map(uid =>
      watchUserPresence(uid, data => {
        setPresence(prev => ({ ...prev, [uid]: data }))
      })
    )

    return () => unsubs.forEach(fn => fn?.())
  }, [convos, user?.uid])

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

  const filtered = convos.filter(convo => {
    const otherUid = getOtherUid(convo)
    const name = convo.type === 'group'
      ? convo.groupName || ''
      : convo.memberNames?.[otherUid] || ''

    if (!name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'unread') return (convo.unreadCount?.[user.uid] || 0) > 0
    if (filter === 'groups') return convo.type === 'group'
    return true
  })

  const pinned = filtered.filter(c => c.pinnedBy?.includes(user.uid))
  const rest = filtered.filter(c => !c.pinnedBy?.includes(user.uid))

  function openConversation(id) {
    navigate(`/app/chats/${id}`)
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
      <aside style={{
        width: '64px',
        flexShrink: 0,
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: '4px',
      }} className="hide-mobile">
        <button
          onClick={() => navigate('/app/chats')}
          title="ChatMi"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'var(--primary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
            color: '#fff',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span className="material-icons" style={{ fontSize: '20px' }}>chat_bubble</span>
        </button>

        {NAV_ITEMS.map(({ id, icon, label, path }) => {
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
                <span style={{
                  position: 'absolute',
                  left: 0,
                  top: '28%',
                  bottom: '28%',
                  width: '3px',
                  background: 'var(--primary)',
                  borderRadius: '0 3px 3px 0',
                }} />
              )}
              <span className="material-icons" style={{ fontSize: '22px' }}>{icon}</span>
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
          <span className="material-icons" style={{ fontSize: '22px' }}>logout</span>
        </button>
      </aside>

      <div style={{
        width: '320px',
        flexShrink: 0,
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }} className="conversation-panel">
        <div style={{
          padding: '14px 16px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Chats</h1>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {convos.length} conversation{convos.length === 1 ? '' : 's'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <IconBtn icon="group_add" title="New group" onClick={() => setShowNewGroup(true)} />
            <IconBtn icon="edit" title="New chat" onClick={() => navigate('/app/friends')} />
          </div>
        </div>

        <div style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <span className="material-icons" style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              fontSize: '18px',
              pointerEvents: 'none',
            }}>search</span>
            <input
              type="text"
              placeholder="Search conversations..."
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
                borderRadius: '8px',
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

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
              Loading conversations...
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div style={{
                    padding: '12px 16px 4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.04em',
                  }}>
                    📌 Pinned
                  </div>
                  {pinned.map(convo => (
                    <ConvoItem
                      key={convo.id}
                      convo={convo}
                      user={user}
                      presence={presence}
                      getOtherUid={getOtherUid}
                      onClick={() => openConversation(convo.id)}
                    />
                  ))}
                </>
              )}

              {rest.length === 0 && pinned.length === 0 ? (
                <div className="empty-state" style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '32px 18px',
                  textAlign: 'center',
                  gap: '10px',
                }}>
                  <span className="material-icons" style={{ fontSize: '56px', color: 'var(--text-tertiary)', opacity: 0.35 }}>
                    chat_bubble_outline
                  </span>
                  <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {search ? 'No conversations found' : 'No conversations yet'}
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    {search ? 'Try a different keyword.' : 'Start a new chat from Friends.'}
                  </p>
                  {!search && (
                    <button
                      onClick={() => navigate('/app/friends')}
                      style={{
                        marginTop: '6px',
                        border: 'none',
                        background: 'var(--primary)',
                        color: '#fff',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      Find friends
                    </button>
                  )}
                </div>
              ) : (
                rest.map(convo => (
                  <ConvoItem
                    key={convo.id}
                    convo={convo}
                    user={user}
                    presence={presence}
                    getOtherUid={getOtherUid}
                    onClick={() => openConversation(convo.id)}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary)',
      }} className="hide-mobile">
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <span className="material-icons" style={{ fontSize: '80px', color: 'var(--text-tertiary)', opacity: 0.2 }}>
            mark_unread_chat_alt
          </span>
          <p style={{ margin: '12px 0 6px', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Select a conversation
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-tertiary)' }}>
            Choose a chat to open it here
          </p>
        </div>
      </div>

      <div className="bottom-nav" style={{ display: 'flex' }}>
        {NAV_ITEMS.map(({ id, icon, path }) => {
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
              <span className="material-icons" style={{ fontSize: '24px' }}>{icon}</span>
            </button>
          )
        })}
      </div>

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
      <span className="material-icons" style={{ fontSize: '20px' }}>{icon}</span>
    </button>
  )
}

function ConvoItem({ convo, user, presence, getOtherUid, onClick }) {
  const otherUid = getOtherUid(convo)
  const isGroup = convo.type === 'group'
  const name = isGroup ? (convo.groupName || 'Group') : (convo.memberNames?.[otherUid] || 'Unknown')
  const photo = isGroup ? convo.groupPhoto : convo.memberPhotos?.[otherUid]
  const unread = convo.unreadCount?.[user.uid] || 0
  const lastMsg = convo.lastMessage
  const isOnline = presence[otherUid]?.status === 'online'
  const avatarColor = getAvatarColor(name)

  function previewText() {
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
        padding: '10px 14px',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        background: 'transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {photo ? (
          <img
            src={photo}
            alt={name}
            style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: avatarColor.bg,
            color: avatarColor.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '16px',
          }}>
            {getInitials(name)}
          </div>
        )}

        {!isGroup && (
          <span style={{
            position: 'absolute',
            bottom: '1px',
            right: '1px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2px solid var(--bg-primary)',
            background: isOnline ? 'var(--online)' : 'var(--offline)',
          }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
          <span style={{
            fontSize: '14px',
            fontWeight: unread > 0 ? 700 : 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
          {lastMsg?.timestamp && (
            <span style={{
              fontSize: '11px',
              color: unread > 0 ? 'var(--primary)' : 'var(--text-tertiary)',
              flexShrink: 0,
              marginLeft: '6px',
              fontWeight: unread > 0 ? 600 : 400,
            }}>
              {formatTime(lastMsg.timestamp)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: '12px',
            color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            fontWeight: unread > 0 ? 500 : 400,
          }}>
            {lastMsg?.senderId === user.uid && <span style={{ color: 'var(--text-tertiary)' }}>You: </span>}
            {previewText()}
          </span>

          {unread > 0 && (
            <span style={{
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
            }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function NewGroupModal({ user, onClose, onCreated }) {
  const [groupName, setGroupName] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)

  const toggle = u => {
    setSelected(prev =>
      prev.find(s => s.uid === u.uid)
        ? prev.filter(s => s.uid !== u.uid)
        : [...prev, u]
    )
  }

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
      setResults((res || []).filter(u => u.uid !== user.uid))
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

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

      toast.success('Group created!')
      onCreated(convId)
    } catch {
      toast.error('Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: '18px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          maxHeight: '90vh',
          overflow: 'hidden',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>New Group</p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>Pick a name and add members</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Group name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. College Friends"
              maxLength={60}
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '12px',
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
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Add members
            </label>
            <input
              type="text"
              value={searchQ}
              onChange={handleSearch}
              placeholder="Search by username..."
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '12px',
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {selected.map(u => (
                  <span
                    key={u.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 9px',
                      borderRadius: '999px',
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {u.displayName || u.username || 'Member'}
                    <button
                      onClick={() => toggle(u)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--primary)',
                        fontSize: '16px',
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

            <div style={{
              maxHeight: '220px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 10px',
                      borderRadius: '12px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary-light)' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: ac.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
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

          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selected.length === 0}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: creating || !groupName.trim() || selected.length === 0 ? 'var(--border)' : 'var(--primary)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: creating || !groupName.trim() || selected.length === 0 ? 'not-allowed' : 'pointer',
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