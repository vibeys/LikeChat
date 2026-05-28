import React, { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('')
}

function getLastMessagePreview(conv) {
  const last = conv?.lastMessage?.text || ''
  if (!last) return 'No messages yet'
  return last
}

function getTimestamp(conv) {
  const ts = conv?.lastMessage?.timestamp || conv?.createdAt || null
  if (!ts) return ''
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatList({
  conversations = [],
  activeConvId,
  onSelectConversation,
  onlineUsers = [],
}) {
  const { userData } = useAuth()

  // In the chat list, all private conversations are with friends
  // We always show online dot for friends (respecting their own privacy toggle)
  const showOnline = true // individual items check the other user's data if available
  const showPhoto = true // show photos for all users in chat list

  const items = useMemo(() => {
    return conversations.map(conv => {
      const isPrivate = conv.type === 'private'
      const otherUid = isPrivate
        ? (conv.members || []).find(uid => uid !== userData?.uid)
        : null

      const otherName = isPrivate
        ? conv.memberNames?.[otherUid] || 'Unknown'
        : conv.groupName || 'Group chat'

      const otherPhoto = isPrivate
        ? conv.memberPhotos?.[otherUid] || ''
        : conv.groupPhoto || ''

      const isOnline = otherUid ? onlineUsers.includes(otherUid) : false

      return {
        ...conv,
        otherUid,
        otherName,
        otherPhoto,
        isOnline,
      }
    })
  }, [conversations, onlineUsers, userData?.uid])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold text-slate-900">Chats</h2>
        <p className="text-xs text-slate-500">Your conversations</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">No conversations yet.</div>
        ) : (
          items.map(conv => {
            const active = conv.id === activeConvId
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation?.(conv)}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  active ? 'bg-blue-50' : 'bg-white'
                }`}
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200">
                  {showPhoto && conv.otherPhoto ? (
                    <img
                      src={conv.otherPhoto}
                      alt={conv.otherName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-slate-700">
                      {getInitials(conv.otherName)}
                    </span>
                  )}

                  {showOnline && conv.isOnline && conv.type === 'private' ? (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {conv.otherName}
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500">
                      {getTimestamp(conv)}
                    </div>
                  </div>

                  <div className="mt-1 truncate text-sm text-slate-500">
                    {getLastMessagePreview(conv)}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}