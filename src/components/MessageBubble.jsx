import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, Checks, ArrowBendUpRight, Smiley, Trash, FileText, Download, Play, Phone, PhoneX, VideoCamera, Users, UserPlus, Megaphone } from '@phosphor-icons/react'
import { formatTime } from '../lib/utils'
import { addReaction, removeReaction, softDeleteMessage, unsendMessage } from '../services/chatService'
import { watchCallStatus } from '../services/callService'

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎']

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderWithMentions(text, memberNames = {}) {
  if (!text || !text.includes('@')) return text

  const mentions = Object.values(memberNames)
    .filter(Boolean)
    .map(name => `@${name}`)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)

  if (!mentions.length) return text

  const regex = new RegExp(`(${mentions.join('|')})`, 'i')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part)
      ? <span key={i} style={{ color: 'var(--primary)', fontWeight: 700 }}>{part}</span>
      : part
  )
}

export default function MessageBubble({ msg, isMine, convId, currentUid, onReply, senderName, senderPhoto, isGroup, memberNames = {}, onJoinCall }) {
  const [showActions, setShowActions] = useState(false)
  const [showEmojis,  setShowEmojis]  = useState(false)
  const [callActive, setCallActive] = useState(null) // null = unknown, true/false
  const longPressTimer = useRef(null)

  // Watch call status for `call_started` messages with a callId
  useEffect(() => {
    if (msg?.eventType !== 'call_started' || !msg?.metadata?.callId) return
    const unsub = watchCallStatus(msg.metadata.callId, status => {
      setCallActive(status === 'ringing' || status === 'active')
    })
    return () => unsub()
  }, [msg?.eventType, msg?.metadata?.callId])

  if (!msg) return null

  if (msg.type === 'announce') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 14px', animation: 'bubbleIn 0.18s ease-out' }}>
        <div style={{ maxWidth: 420, width: '100%', padding: '12px 16px', borderRadius: 16, background: 'rgba(30,144,255,0.1)', border: '1px solid rgba(30,144,255,0.3)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Megaphone size={18} style={{ flexShrink: 0, color: 'var(--primary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {senderName || 'Admin'} · Announcement
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {msg.text}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (msg.type === 'system' || msg.senderId === 'system') {
    const ev = msg.eventType || ''
    const ct = msg.callType || ''
    let Icon = null
        if (ev === 'call_started') Icon = ct === 'video' ? <VideoCamera size={16} /> : <Phone size={16} />
    else if (ev === 'call_joined') Icon = <UserPlus size={16} />
    else if (ev === 'call_ended') Icon = ct === 'video' ? <VideoCamera size={16} /> : <Phone size={16} />
    else if (ev === 'call_declined' || ev === 'missed_call') Icon = <PhoneX size={16} />

        if (Icon) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 14px', animation: 'bubbleIn 0.18s ease-out' }}>
          <div style={{ maxWidth: 420, width: '100%', padding: '10px 14px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--bg-3)', color: 'var(--text-primary)' }}>{Icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>{msg.text}</p>
            </div>
                        {ev === 'call_started' && onJoinCall && msg.metadata?.callId && (
                          <motion.button
                            onClick={() => callActive !== false && onJoinCall(msg.metadata.callId, msg.metadata.roomUrl)}
                            whileHover={{ scale: callActive !== false ? 1.03 : 1 }}
                            whileTap={{ scale: callActive !== false ? 0.97 : 1 }}
                            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', background: callActive !== false ? 'var(--primary)' : 'var(--bg-3)', color: callActive !== false ? '#fff' : 'var(--text-tertiary)', fontSize: 12, fontWeight: 800, cursor: callActive !== false ? 'pointer' : 'default', opacity: callActive === null ? 0.6 : 1 }}
                          >
                            {callActive === false ? 'Ended' : callActive === null ? '...' : 'Join'}
                          </motion.button>
                        )}
                        {ev === 'call_started' && !onJoinCall && callActive !== false && (
                          <span style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>LIVE</span>
                        )}
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 14px' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 999, fontStyle: 'italic' }}>{msg.text}</span>
      </div>
    )
  }

  const isDeleted    = msg.deletedFor?.includes(currentUid)
  const isUnsent     = msg.unsent === true
  const readByOthers = msg.readBy?.filter(uid => uid !== currentUid && uid !== 'system')?.length ?? 0
  const isRead       = readByOthers > 0
  const readByNames  = isGroup && isMine && msg.readBy
    ? msg.readBy.filter(uid => uid !== currentUid && uid !== msg.senderId && uid !== 'system').map(uid => memberNames[uid]?.split(' ')[0] || 'Someone')
    : []

  const handleLongPressStart = () => { longPressTimer.current = setTimeout(() => setShowActions(true), 400) }
  const handleLongPressEnd   = () => clearTimeout(longPressTimer.current)

  const handleReact = async (emoji) => {
    try {
      const uids = msg.reactions?.[emoji] ?? []
      if (uids.includes(currentUid)) {
        await removeReaction(convId, msg.id, currentUid, emoji)
      } else {
        const currentEmoji = Object.entries(msg.reactions ?? {}).find(([, u]) => u.includes(currentUid))?.[0]
        if (currentEmoji && currentEmoji !== emoji) await removeReaction(convId, msg.id, currentUid, currentEmoji)
        await addReaction(convId, msg.id, currentUid, emoji)
      }
    } catch (err) { console.error('Reaction error:', err) }
    setShowEmojis(false)
    setShowActions(false)
  }

  const handleDeleteForMe = async () => {
    try { await softDeleteMessage(convId, msg.id, currentUid) }
    catch (err) { console.error(err) }
    setShowActions(false)
  }

  const handleUnsent = async () => {
    try {
      await unsendMessage(convId, msg.id)
    } catch (err) {
      console.error('Unsend failed:', err)
    }
    setShowActions(false)
  }

  const renderContent = () => {
    if (isUnsent)  return <p className="text-sm italic opacity-50">{isMine ? 'You unsent a message' : 'This message was unsent'}</p>
    if (isDeleted) return <p className="text-sm italic opacity-50">You deleted this message</p>
    if (msg.type === 'image') {
      return (
        <div>
          <img src={msg.fileURL} alt="sent" className="rounded-xl max-w-[220px] max-h-[280px] object-cover cursor-pointer" style={{ animation: 'fadeIn 0.3s ease' }} onClick={() => window.open(msg.fileURL, '_blank')} />
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
          <a href={msg.fileURL} target="_blank" rel="noreferrer" download><Download size={14} /></a>
        </div>
      )
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{renderWithMentions(msg.text, memberNames)}</p>
  }

  const hasReactions = msg.reactions && Object.entries(msg.reactions).some(([, u]) => u?.length > 0)

  return (
    <div className={`flex mb-1 px-2 md:px-4 ${isMine ? 'justify-end' : 'justify-start'}`} style={{ animation: 'bubbleIn 0.18s ease-out' }}>

      {!isMine && senderPhoto && (
        <img src={senderPhoto} alt={senderName} className="w-7 h-7 rounded-full object-cover self-end mr-2 flex-shrink-0" />
      )}

      <div className={`relative max-w-[75%] md:max-w-[60%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>

        {!isMine && senderName && (
          <p className="text-xs font-medium mb-1 px-1" style={{ color: 'var(--accent)' }}>{senderName}</p>
        )}

        {msg.replyTo && (
          <div className="text-xs px-3 py-1.5 rounded-t-xl mb-[-4px] border-l-2 border-[var(--accent)] bg-black/5 text-[var(--text-2)] truncate max-w-full">
            {msg.replyTo.text || '📎 Attachment'}
          </div>
        )}

        <div
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          onClick={() => !isDeleted && !isUnsent && setShowActions(s => !s)}
          className={[
            'relative px-3 py-2 rounded-2xl cursor-pointer select-none transition-all duration-150 hover:shadow-md',
            isMine ? 'bg-[var(--accent)] text-white rounded-br-sm hover:brightness-110' : 'bg-[var(--bg-1)] text-[var(--text-1)] rounded-bl-sm shadow-sm hover:shadow-md',
            (isDeleted || isUnsent) ? 'opacity-60' : '',
          ].join(' ')}
        >
          {renderContent()}
          <div className="flex items-center gap-1 mt-0.5 justify-end">
            <span className={`text-[10px] ${isMine ? 'text-white/70' : 'text-[var(--text-3)]'}`}>{formatTime(msg.createdAt)}</span>
            {isMine && !isUnsent && (isRead ? <Checks size={12} className="text-white/90" /> : <Check size={12} className="text-white/70" />)}
          </div>
        </div>

        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-2" style={{ animation: 'slideUp 0.2s ease-out' }}>
            {Object.entries(msg.reactions).filter(([, uids]) => uids?.length > 0).map(([emoji, uids]) => {
              const reacted = uids.includes(currentUid)
              return (
                <button key={emoji} onClick={() => handleReact(emoji)}
                        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-all hover:scale-110 active:scale-95"
                        style={{ background: reacted ? 'var(--accent-muted)' : 'var(--bg-2)', border: `1.5px solid ${reacted ? 'var(--accent)' : 'var(--border)'}`, animation: 'popIn 0.2s ease-out' }}>
                  <span>{emoji}</span>
                  <span style={{ color: reacted ? 'var(--accent)' : 'var(--text-2)' }}>{uids.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {isGroup && isMine && readByNames.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontStyle: 'italic' }}>
            Seen by {readByNames.join(', ')}
          </div>
        )}

        {showActions && !isDeleted && !isUnsent && (
          <div className={['absolute -top-12 flex items-center gap-1 bg-[var(--bg-1)] border border-[var(--border)] rounded-2xl shadow-lg px-2 py-1.5 z-10 backdrop-blur-sm', isMine ? 'right-0' : 'left-0'].join(' ')} style={{ animation: 'popIn 0.2s ease-out' }}>
            {showEmojis ? (
              QUICK_EMOJIS.map(e => (
                <button key={e} onClick={() => handleReact(e)} className="hover:scale-125 transition-transform duration-150 text-lg p-1 active:scale-95 rounded-lg hover:bg-[var(--bg-2)]">{e}</button>
              ))
            ) : (
              <>
                                <button onClick={() => setShowEmojis(true)} title="React" className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95" style={{ color: 'var(--text-2)' }}><Smiley size={16} /></button>
                <button onClick={() => { onReply(msg); setShowActions(false) }} title="Reply" className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95" style={{ color: 'var(--text-2)' }}><ArrowBendUpRight size={16} /></button>
                {isMine && (
                  <>
                    <button onClick={handleUnsent} title="Unsend for everyone" className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95 text-xs font-medium" style={{ color: 'var(--danger)' }}>Unsend</button>
                                        <button onClick={handleDeleteForMe} title="Delete for me" className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95" style={{ color: 'var(--text-3)' }}><Trash size={16} /></button>
                  </>
                )}
                {!isMine && (
                  <button onClick={handleDeleteForMe} title="Delete for me" className="p-1.5 hover:bg-[var(--bg-2)] rounded-lg transition-all duration-150 hover:scale-110 active:scale-95" style={{ color: 'var(--text-3)' }}><Trash size={16} /></button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showActions && (
        <div className="fixed inset-0 z-0" onClick={() => { setShowActions(false); setShowEmojis(false) }} />
      )}
    </div>
  )
// Note: The above code assumes the existence of certain CSS variables and classes for styling, as well as the presence of the specified services and utilities. Adjust as needed for your specific project setup.

