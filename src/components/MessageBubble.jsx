import { useState, useRef } from 'react'
import { Check, CheckCheck, Reply, Smile, Trash2, FileText, Download, Play } from 'lucide-react'
import { formatTime } from '../lib/utils'
import { addReaction, removeReaction, softDeleteMessage } from '../services/chatService'

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎']

export default function MessageBubble({ msg, isMine, convId, currentUid, onReply, senderName, senderPhoto, isGroup, memberNames = {} }) {
  const [showActions, setShowActions] = useState(false)
  const [showEmojis, setShowEmojis]   = useState(false)
  const longPressTimer = useRef(null)

  if (!msg) return null

  const isDeleted  = msg.deletedFor?.includes(currentUid)
  const isUnsent   = msg.unsent === true
  // For single chats: readBy includes sender + recipient when read
  // For group chats: readBy includes all who have read
  const readByOthers = msg.readBy?.filter(uid => uid !== currentUid && uid !== 'system')?.length ?? 0
  const isRead = readByOthers > 0
  
  // Get names of people who read this message (for groups)
  const readByNames = isGroup && isMine && msg.readBy 
    ? msg.readBy
        .filter(uid => uid !== currentUid && uid !== msg.senderId && uid !== 'system')
        .map(uid => memberNames[uid]?.split(' ')[0] || 'Someone')
    : []

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 400)
  }
  const handleLongPressEnd = () => clearTimeout(longPressTimer.current)

  // Toggle reaction — if already reacted with this emoji, remove it
  const handleReact = async (emoji) => {
    try {
      const uids = msg.reactions?.[emoji] ?? []
      if (uids.includes(currentUid)) {
        await removeReaction(convId, msg.id, currentUid, emoji)
      } else {
        // Remove any OTHER emoji this user already reacted with (one emoji per user)
        const currentEmoji = Object.entries(msg.reactions ?? {}).find(
          ([, u]) => u.includes(currentUid)
        )?.[0]
        if (currentEmoji && currentEmoji !== emoji) {
          await removeReaction(convId, msg.id, currentUid, currentEmoji)
        }
        await addReaction(convId, msg.id, currentUid, emoji)
      }
    } catch (err) {
      console.error('Reaction error:', err)
    }
    setShowEmojis(false)
    setShowActions(false)
  }

  // Soft delete (delete for me only)
  const handleDeleteForMe = async () => {
    try { await softDeleteMessage(convId, msg.id, currentUid) }
    catch (err) { console.error(err) }
    setShowActions(false)
  }

  // Unsent (delete for everyone)
  const handleUnsent = async () => {
    try {
      const { updateDoc, doc } = await import('firebase/firestore')
      const { db } = await import('../lib/firebase')
      await updateDoc(doc(db, 'conversations', convId, 'messages', msg.id), {
        unsent: true, text: '', fileURL: null, fileName: null,
      })
    } catch (err) { console.error(err) }
    setShowActions(false)
  }

  const renderContent = () => {
    if (isUnsent) {
      return (
        <p className="text-sm italic opacity-50">
          {isMine ? 'You unsent a message' : 'This message was unsent'}
        </p>
      )
    }
    if (isDeleted) {
      return <p className="text-sm italic opacity-50">You deleted this message</p>
    }
    if (msg.type === 'image') {
      return (
        <div>
          <img src={msg.fileURL} alt="sent"
               className="rounded-xl max-w-[220px] max-h-[280px] object-cover cursor-pointer"
               style={{ animation: 'fadeIn 0.3s ease' }}
               onClick={() => window.open(msg.fileURL, '_blank')} />
          {msg.text && <p className="text-sm mt-1">{msg.text}</p>}
        </div>
      )
    }
    if (msg.type === 'video') {
      return (
        <div className="rounded-xl overflow-hidden max-w-[240px]">
          <video src={msg.fileURL} controls className="w-full rounded-xl max-h-[200px]" />
          {msg.text && <p className="text-sm mt-1">{msg.text}</p>}
        </div>
      )
    }
    if (msg.type === 'file') {
      return (
        <div className="flex items-center gap-2 text-sm">
          <FileText size={16} />
          <span className="underline truncate max-w-[160px]">{msg.fileName}</span>
          <a href={msg.fileURL} target="_blank" rel="noreferrer" download>
            <Download size={14} />
          </a>
        </div>
      )
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
  }

  const hasReactions = msg.reactions && Object.entries(msg.reactions).some(([, u]) => u?.length > 0)

  return (
    <div className={`flex mb-1 px-2 md:px-4 ${isMine ? 'justify-end' : 'justify-start'}`}
         style={{ animation: 'bubbleIn 0.18s ease-out' }}>

      {/* Avatar for group chats */}
      {!isMine && senderPhoto && (
        <img src={senderPhoto} alt={senderName}
             className="w-7 h-7 rounded-full object-cover self-end mr-2 flex-shrink-0" />
      )}

      <div className={`relative max-w-[75%] md:max-w-[60%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>

        {/* Group sender name */}
        {!isMine && senderName && (
          <p className="text-xs font-medium mb-1 px-1" style={{ color: 'var(--accent)' }}>
            {senderName}
          </p>
        )}

        {/* Reply preview */}
        {msg.replyTo && (
          <div className="text-xs px-3 py-1.5 rounded-t-xl mb-[-4px] border-l-2 border-[var(--accent)] bg-black/5 text-[var(--text-2)] truncate max-w-full">
            {msg.replyTo.text || '📎 Attachment'}
          </div>
        )}

        {/* Bubble */}
        <div
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          onClick={() => !isDeleted && !isUnsent && setShowActions(s => !s)}
          className={[
            'relative px-3 py-2 rounded-2xl cursor-pointer select-none transition-all duration-150 hover:shadow-md',
            isMine
              ? 'bg-[var(--accent)] text-white rounded-br-sm hover:brightness-110'
              : 'bg-[var(--bg-1)] text-[var(--text-1)] rounded-bl-sm shadow-sm hover:shadow-md',
            (isDeleted || isUnsent) ? 'opacity-60' : '',
          ].join(' ')}
        >
          {renderContent()}

          {/* Time + read ticks */}
          <div className="flex items-center gap-1 mt-0.5 justify-end">
            <span className={`text-[10px] ${isMine ? 'text-white/70' : 'text-[var(--text-3)]'}`}>
              {formatTime(msg.createdAt)}
            </span>
            {isMine && !isUnsent && (
              isRead
                ? <CheckCheck size={12} className="text-white/90" />
                : <Check size={12} className="text-white/70" />
            )}
          </div>
        </div>

        {/* Reactions */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-2" style={{ animation: 'slideUp 0.2s ease-out' }}>
            {Object.entries(msg.reactions)
              .filter(([, uids]) => uids?.length > 0)
              .map(([emoji, uids]) => {
                const reacted = uids.includes(currentUid)
                return (
                  <button key={emoji} 
                          onClick={() => handleReact(emoji)}
                          className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-all hover:scale-110 active:scale-95"
                          style={{
                            background: reacted ? 'var(--accent-muted)' : 'var(--bg-2)',
                            border: `1.5px solid ${reacted ? 'var(--accent)' : 'var(--border)'}`,
                            animation: 'popIn 0.2s ease-out',
                          }}>
                    <span>{emoji}</span>
                    <span style={{ color: reacted ? 'var(--accent)' : 'var(--text-2)' }}>
                      {uids.length}
                    </span>
                  </button>
                )
              })}
          </div>
        )}

        {/* Seen by (group chats) */}
        {isGroup && isMine && readByNames.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', fontStyle: 'italic' }}>
            Seen by {readByNames.join(', ')}
          </div>
        )}

        {/* Action bar */}
        {showActions && !isDeleted && !isUnsent && (
          <div className={[
            'absolute -top-12 flex items-center gap-1 bg-[var(--bg-1)] border border-[var(--border)] rounded-2xl shadow-lg px-2 py-1.5 z-10 backdrop-blur-sm',
            isMine ? 'right-0' : 'left-0'
          ].join(' ')}
               style={{ animation: 'popIn 0.2s ease-out' }}>
            {showEmojis ? (
              QUICK_EMOJIS.map(e => (
                <button key={e} 
                        onClick={() => handleReact(e)}
                        className="hover:scale-125 transition-transform duration-150 text-lg p-1 active:scale-95 rounded-lg hover:bg-[var(--bg-2)]">
                  {e}
                </button>
              ))
            ) : (
              <>
                <button onClick={() => setShowEmojis(true)} title="React"
                        className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
                        style={{ color: 'var(--text-2)' }}>
                  <Smile size={16} />
                </button>
                <button onClick={() => { onReply(msg); setShowActions(false) }} title="Reply"
                        className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
                        style={{ color: 'var(--text-2)' }}>
                  <Reply size={16} />
                </button>
                {isMine && (
                  <>
                    <button onClick={handleUnsent} title="Unsend for everyone"
                            className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95 text-xs font-medium"
                            style={{ color: 'var(--danger)' }}>
                      Unsend
                    </button>
                    <button onClick={handleDeleteForMe} title="Delete for me"
                            className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
                            style={{ color: 'var(--text-3)' }}>
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                {!isMine && (
                  <button onClick={handleDeleteForMe} title="Delete for me"
                          className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
                          style={{ color: 'var(--text-3)' }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {showActions && (
        <div className="fixed inset-0 z-0"
             onClick={() => { setShowActions(false); setShowEmojis(false) }} />
      )}
    </div>
  )
}