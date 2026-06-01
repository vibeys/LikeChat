// src/pages/app/FriendsPage.jsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import {
  watchFriends,
  watchRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  blockUser,
} from '../../services/friendService'
import { searchByUsername, getUser } from '../../services/userService'
import { createPrivateConv } from '../../services/chatService'
import { getAvatarColor, getInitials } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  MagnifyingGlass,
  UserPlus,
  ChatCircle,
  Check,
  X,
  Prohibit,
  Users,
  Clock,
  ArrowLeft,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

export default function FriendsPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const mounted = useRef(true)
  const searchTimer = useRef(null)

  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState({})

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!user?.uid) return

    let unsubFriends = null
    let unsubRequests = null

    unsubFriends = watchFriends(user.uid, async rawFriends => {
      const profiles = await Promise.all(
        (rawFriends || []).map(async friend => {
          try {
            const profile = await getUser(friend.uid)
            return profile ? { ...friend, ...profile } : friend
          } catch {
            return friend
          }
        })
      )

      if (mounted.current) {
        setFriends(profiles)
        setLoading(false)
      }
    })

    unsubRequests = watchRequests(user.uid, async rawRequests => {
      const profiles = await Promise.all(
        (rawRequests || []).map(async request => {
          try {
            const profile = await getUser(request.uid)
            return profile ? { ...request, ...profile } : request
          } catch {
            return request
          }
        })
      )

      if (mounted.current) {
        setReceived(profiles.filter(r => r.direction === 'received'))
        setSent(profiles.filter(r => r.direction === 'sent'))
        setLoading(false)
      }
    })

    return () => {
      unsubFriends?.()
      unsubRequests?.()
    }
  }, [user?.uid])

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)

    if (!q.trim()) {
      setResults([])
      setSearching(false)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      return
    }

    setSearching(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchByUsername(q.trim())
        if (mounted.current) {
          setResults((res || []).filter(u => u.uid !== user.uid))
        }
      } catch {
        toast.error('Search failed')
      } finally {
        if (mounted.current) setSearching(false)
      }
    }, 300)
  }

  async function handleSendRequest(targetUid) {
    setActing(a => ({ ...a, [targetUid]: true }))
    try {
      await sendFriendRequest(user.uid, targetUid)
      toast.success('Friend request sent!')
    } catch (err) {
      toast.error(err?.message || 'Failed to send request')
    } finally {
      setActing(a => ({ ...a, [targetUid]: false }))
    }
  }

  async function handleAccept(fromUid) {
    setActing(a => ({ ...a, [fromUid]: true }))
    try {
      await acceptFriendRequest(user.uid, fromUid)
      toast.success('Friend added!')
    } catch {
      toast.error('Failed to accept request')
    } finally {
      setActing(a => ({ ...a, [fromUid]: false }))
    }
  }

    async function handleDecline(fromUid) {
    setActing(a => ({ ...a, [fromUid]: true }))
    try {
      await declineFriendRequest(user.uid, fromUid)
    } catch {
      toast.error('Failed to decline')
    } finally {
      setActing(a => ({ ...a, [fromUid]: false }))
    }
  }

    async function handleBlock(targetUid) {
    if (!window.confirm('Block this user?')) return
    setActing(a => ({ ...a, [targetUid]: true }))
    try {
      await blockUser(user.uid, targetUid)
      // Optimistically update local user state so UI reflects block immediately
      try {
        setUser(prev => prev ? ({ ...prev, blockedUsers: Array.from(new Set([...(prev.blockedUsers || []), targetUid])) }) : prev)
      } catch (_) {}
    } catch {
      toast.error('Failed to block user')
    } finally {
      setActing(a => ({ ...a, [targetUid]: false }))
    }
  }

  async function handleMessage(friend) {
    setActing(a => ({ ...a, [friend.uid]: 'msg' }))
    try {
      const myProfile = await getUser(user.uid)

      const names = {
        [user.uid]: myProfile?.displayName || user.displayName || '',
        [friend.uid]: friend.displayName || '',
      }

      const photos = {
        [user.uid]: myProfile?.photoURL || user.photoURL || '',
        [friend.uid]: friend.photoURL || '',
      }

      const convId = await createPrivateConv(user.uid, friend.uid, names, photos)
      navigate(`/app/chats/${convId}`)
    } catch (err) {
      console.error('handleMessage error:', err)
      toast.error('Failed to open chat')
    } finally {
      setActing(a => ({ ...a, [friend.uid]: false }))
    }
  }

  const receivedCount = received.length

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 18px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/app/chats')}
          className="hide-desktop"
          title="Back"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            Friends
          </h1>
          <p style={{
            margin: '2px 0 0',
            fontSize: '12px',
            color: 'var(--text-tertiary)',
          }}>
            Add people, manage requests, and open chats
          </p>
        </div>
      </div>

      <div style={{
        padding: '12px 18px',
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
      }}>
        {[
          { id: 'friends', label: `Friends (${friends.length})` },
          { id: 'requests', label: 'Requests', badge: receivedCount },
          { id: 'search', label: 'Add' },
        ].map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: tab === id ? 'var(--primary)' : 'var(--border)',
              background: tab === id ? 'var(--primary)' : 'transparent',
              color: tab === id ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{label}</span>
            {badge > 0 && (
              <span style={{
                minWidth: '18px',
                height: '18px',
                padding: '0 5px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.18)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 800,
              }}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px 18px',
      }}>
        {tab === 'friends' && (
          <>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '36px 0' }}>
                <Spinner />
              </div>
            ) : friends.length === 0 ? (
              <EmptyState
                icon={<Users size={56} />}
                title="No friends yet"
                text="Search for people and send them a friend request."
                action={
                  <button
                    onClick={() => setTab('search')}
                    style={{
                      border: 'none',
                      background: 'var(--primary)',
                      color: '#fff',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Find friends
                  </button>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {friends.map((friend, idx) => (
                  <FriendCard
                    key={friend.uid}
                    user={friend}
                    acting={acting[friend.uid]}
                    onMessage={() => handleMessage(friend)}
                    onBlock={() => handleBlock(friend.uid)}
                    style={{ animationDelay: `${idx * 0.04}s` }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <>
            {received.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                <SectionTitle title="Received" />
                {received.map((req, idx) => (
                  <RequestCard
                    key={req.uid}
                    user={req}
                    acting={acting[req.uid]}
                    onAccept={() => handleAccept(req.uid)}
                    onDecline={() => handleDecline(req.uid)}
                    style={{ animationDelay: `${idx * 0.04}s` }}
                  />
                ))}
              </div>
            )}

            {sent.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <SectionTitle title="Sent" />
                {sent.map((req, idx) => (
                  <SentCard
                    key={req.uid}
                    user={req}
                    style={{ animationDelay: `${(received.length + idx) * 0.04}s` }}
                  />
                ))}
              </div>
            )}

            {!received.length && !sent.length && (
              <EmptyState
                icon={<Clock size={56} />}
                title="No requests"
                text="Friend requests will appear here."
              />
            )}
          </>
        )}

        {tab === 'search' && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderRadius: '14px',
              padding: '11px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              marginBottom: '14px',
            }}>
              <MagnifyingGlass size={16} weight="bold" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <input
                className="form-input"
                style={{
                  border: 'none',
                  background: 'transparent',
                  flex: 1,
                  padding: 0,
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
                placeholder="Search by username..."
                value={searchQ}
                onChange={handleSearch}
                autoFocus
              />
              {searching && <Spinner size={14} />}
            </div>

            {!searchQ.trim() ? (
              <EmptyState
                icon={<UserPlus size={56} />}
                title="Search for friends"
                text="Type a username to find people."
              />
            ) : results.length === 0 && !searching ? (
                            <EmptyState
                icon={<MagnifyingGlass size={56} weight="light" />}
                title="No users found"
                text={`No one found for "@${searchQ}"`}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {results.map((u, idx) => {
                  const isFriend = friends.some(f => f.uid === u.uid)
                  const isPending = sent.some(r => r.uid === u.uid)
                  const isReceived = received.some(r => r.uid === u.uid)

                  return (
                    <SearchResultCard
                      key={u.uid}
                      user={u}
                      acting={acting[u.uid]}
                      isFriend={isFriend}
                      isPending={isPending}
                      isReceived={isReceived}
                      onAddFriend={() => handleSendRequest(u.uid)}
                      style={{ animationDelay: `${idx * 0.04}s` }}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ title }) {
  return (
    <div style={{
      fontSize: '12px',
      fontWeight: 800,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: 'var(--text-tertiary)',
      padding: '0 2px',
    }}>
      {title}
    </div>
  )
}

function EmptyState({ icon, title, text, action }) {
  return (
    <div style={{
      minHeight: '280px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: '10px',
      padding: '28px 12px',
    }}>
      <div style={{ color: 'var(--text-tertiary)', opacity: 0.35 }}>
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</p>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-tertiary)', maxWidth: '280px', lineHeight: 1.5 }}>
        {text}
      </p>
      {action}
    </div>
  )
}

function FriendCard({ user, onMessage, onBlock, acting, style }) {
  const ac = getAvatarColor(user.displayName || user.username || '')
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 1px 0 rgba(255,255,255,0.02)',
        animation: 'fadeIn 0.2s ease',
        ...style,
      }}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt={user.displayName} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: ac.bg,
          color: ac.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '16px',
          flexShrink: 0,
        }}>
          {getInitials(user.displayName || user.username || '?')}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName || 'Unknown'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          @{user.username || user.uid?.slice(0, 8)}
        </div>
        {user.bio && (
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '4px',
            lineHeight: 1.45,
          }}>
            {user.bio}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {acting ? (
          <Spinner size={14} />
        ) : (
          <>
                        <ActionIconButton title="Message" onClick={onMessage}>
              <ChatCircle size={16} weight="bold" />
            </ActionIconButton>
            <ActionIconButton title="Block" onClick={onBlock} danger>
              <Prohibit size={16} weight="bold" />
            </ActionIconButton>
          </>
        )}
      </div>
    </div>
  )
}

function RequestCard({ user, acting, onAccept, onDecline, style }) {
  const ac = getAvatarColor(user.displayName || user.username || '')
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style,
      }}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt={user.displayName} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: ac.bg,
          color: ac.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '16px',
          flexShrink: 0,
        }}>
          {getInitials(user.displayName || user.username || '?')}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {user.displayName || 'Unknown'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          @{user.username || user.uid?.slice(0, 8)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {acting ? (
          <Spinner size={14} />
        ) : (
          <>
                        <ActionIconButton title="Accept" onClick={onAccept} accept>
              <Check size={16} weight="bold" />
            </ActionIconButton>
            <ActionIconButton title="Decline" onClick={onDecline} danger>
              <X size={16} weight="bold" />
            </ActionIconButton>
          </>
        )}
      </div>
    </div>
  )
}

function SentCard({ user, style }) {
  const ac = getAvatarColor(user.displayName || user.username || '')
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style,
      }}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt={user.displayName} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: ac.bg,
          color: ac.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '16px',
          flexShrink: 0,
        }}>
          {getInitials(user.displayName || user.username || '?')}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {user.displayName || 'Unknown'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          @{user.username || user.uid?.slice(0, 8)}
        </div>
      </div>

      <span style={{
        padding: '6px 11px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        Pending
      </span>
    </div>
  )
}

function SearchResultCard({ user, acting, isFriend, isPending, isReceived, onAddFriend, style }) {
  const ac = getAvatarColor(user.displayName || user.username || '')

  let badge = null
  if (isFriend) badge = 'Friends'
  else if (isPending) badge = 'Pending'
  else if (isReceived) badge = 'Received'

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style,
      }}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt={user.displayName} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: ac.bg,
          color: ac.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '16px',
          flexShrink: 0,
        }}>
          {getInitials(user.displayName || user.username || '?')}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {user.displayName || 'Unknown'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          @{user.username || user.uid?.slice(0, 8)}
        </div>
      </div>

      {badge ? (
        <span style={{
          padding: '6px 11px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 700,
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}>
          {badge}
        </span>
      ) : (
        <div style={{ flexShrink: 0 }}>
          {acting ? (
            <Spinner size={14} />
          ) : (
                        <ActionIconButton title="Add Friend" onClick={onAddFriend} accept>
              <UserPlus size={16} weight="bold" />
            </ActionIconButton>
          )}
        </div>
      )}
    </div>
  )
}

function ActionIconButton({ children, onClick, title, danger = false, accept = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '10px',
        border: '1px solid',
        borderColor: accept ? 'rgba(59,130,246,0.35)' : danger ? 'rgba(239,68,68,0.35)' : 'var(--border)',
        background: accept ? 'rgba(59,130,246,0.12)' : danger ? 'rgba(239,68,68,0.12)' : 'var(--bg-secondary)',
        color: accept ? 'var(--primary)' : danger ? 'var(--danger)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (accept) {
          e.currentTarget.style.background = 'rgba(59,130,246,0.18)'
        } else if (danger) {
          e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
        } else {
          e.currentTarget.style.background = 'var(--bg-primary)'
        }
      }}
      onMouseLeave={e => {
        if (accept) {
          e.currentTarget.style.background = 'rgba(59,130,246,0.12)'
        } else if (danger) {
          e.currentTarget.style.background = 'rgba(239,68,68,0.12)'
        } else {
          e.currentTarget.style.background = 'var(--bg-secondary)'
        }
      }}
    >
      {children}
    </button>
  )
}