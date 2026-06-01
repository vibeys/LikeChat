// src/components/MessageInput.jsx
import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { PaperPlaneRight, Paperclip, Smiley, X, Image, Video, File, Megaphone, At } from '@phosphor-icons/react'
import { debounceTyping, setTyping, stopTypingNow } from '../lib/typing'
import { sendMessage, uploadFile, sendAnnouncement, sendMentionNotif } from '../services/chatService'

const EMOJI_ROWS = [
  ['😀','😂','🥹','😍','😎','🤔','😴','😭'],
  ['😤','🤯','🥰','😇','🤣','😮','😢','🫡'],
  ['👍','👎','❤️','🔥','🎉','💯','✅','👀'],
  ['💀','🙏','🫶','😈','🤝','💪','🎮','🍕'],
]

export default function MessageInput({
  convId, currentUser, replyTo, onCancelReply,
  isGroup = false, isAdmin = false, convo = null,
  members = [], memberNames = {},
  disabledMessage = '',
}) {
  const [text,         setText]         = useState('')
  const [loading,      setLoading]      = useState(false)
  const [showEmoji,    setShowEmoji]    = useState(false)
  const [showAttach,   setShowAttach]   = useState(false)
  const [isAnnounce,   setIsAnnounce]   = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)

  const textareaRef = useRef(null)
  const imageRef    = useRef(null)
  const videoRef    = useRef(null)
  const fileRef     = useRef(null)

  useEffect(() => {
    if (!showEmoji && !showAttach) return
    const handler = e => {
      if (!e.target.closest('[data-picker]')) {
        setShowEmoji(false)
        setShowAttach(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmoji, showAttach])

  useEffect(() => {
    return () => {
      if (!convId || !currentUser?.uid) return
      stopTypingNow(convId, currentUser.uid)
    }
  }, [convId, currentUser?.uid])

  const mentionCandidates = isGroup
    ? members
        .filter(uid => uid !== currentUser?.uid)
        .filter(uid => {
          const name = (memberNames[uid] || '').toLowerCase()
          return mentionQuery === '' || name.includes(mentionQuery.toLowerCase())
        })
    : []

  const isDisabled = Boolean(disabledMessage)

  const handleInput = e => {
    if (isDisabled) return
    const val = e.target.value
    setText(val)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'

    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match  = before.match(/@([^\n@]*)$/)
    if (isGroup && match) {
      setMentionQuery(match[1])
      setShowMentions(true)
      setMentionIndex(0)
    } else {
      setShowMentions(false)
      setMentionQuery('')
    }

    if (currentUser?.uid) {
      // debounceTyping handles writing true on first keystroke and auto-stops after silence
      // — one write per burst, not per keystroke, no console spam
      console.debug('[MessageInput] debounceTyping call', { convId, uid: currentUser.uid })
      debounceTyping(convId, currentUser.uid, true)
    }
  }

  const insertMention = uid => {
    const name     = memberNames[uid] || uid
    const cursor   = textareaRef.current?.selectionStart || text.length
    const before   = text.slice(0, cursor)
    const after    = text.slice(cursor)
    const replaced = before.replace(/@([^\n@]*)$/, `@${name} `)
    setText(replaced + after)
    setShowMentions(false)
    setMentionQuery('')
    setTimeout(() => {
      textareaRef.current?.focus()
      const pos = replaced.length
      textareaRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleKeyDown = e => {
    if (currentUser?.uid) debounceTyping(convId, currentUser.uid, true)
    if (showMentions && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionIndex]); return }
      if (e.key === 'Escape')    { setShowMentions(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = async () => {
    if (!text.trim() || !currentUser?.uid || isDisabled) return
    setLoading(true)
    const toSend = text.trim()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setShowMentions(false)

    try {
      if (isAnnounce && isGroup && isAdmin) {
        await sendAnnouncement(convId, currentUser.uid, toSend, convo)
        setIsAnnounce(false)
      } else {
        await sendMessage(convId, {
          senderId: currentUser.uid,
          text:     toSend,
          type:     'text',
          replyTo:  replyTo
            ? { msgId: replyTo.id, text: replyTo.text, senderId: replyTo.senderId }
            : null,
        })
        if (isGroup && convo) {
          const mentioned = extractMentionedUids(toSend, memberNames)
          for (const uid of mentioned) {
            sendMentionNotif(convId, currentUser.uid, uid, toSend, convo).catch(() => {})
          }
        }
      }
      onCancelReply?.()
      setTyping(convId, currentUser.uid, false)
    } catch (err) {
      console.error('Send error:', err)
      setText(toSend)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e, forcedType) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file || !currentUser?.uid || isDisabled) {
      if (isDisabled) toast.error(disabledMessage)
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Please choose a file smaller than 25MB')
      return
    }

    setLoading(true)
    setShowAttach(false)
    try {
      const result  = await uploadFile(file, convId)
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const type    = forcedType || (isImage ? 'image' : isVideo ? 'video' : 'file')
      await sendMessage(convId, {
        senderId: currentUser.uid,
        text: '', type,
        fileURL:  result.url,
        fileName: result.name,
        fileSize: result.size,
        replyTo: replyTo ? { msgId: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : null,
      })
      onCancelReply?.()
    } catch (err) {
      console.error('File upload error:', err)
      toast.error(err?.message || 'Failed to upload file')
    } finally {
      setLoading(false)
    }
  }

  const insertEmoji = emoji => {
    setText(t => t + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  const accentColor = isAnnounce ? 'var(--primary)' : 'var(--accent)'

  return (
    <div className="message-input-area px-3 py-3 border-t relative" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)' }}>

      {disabledMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 14px', borderRadius: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)', fontSize: 13 }}>
          <span>{disabledMessage}</span>
        </div>
      )}

      {replyTo && (
        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-2 border-l-2"
             style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', animation: 'slideDown 0.2s ease-out' }}>
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Replying</p>
            <p className="text-xs truncate max-w-[260px]" style={{ color: 'var(--text-2)' }}>{replyTo.text || '📎 Attachment'}</p>
          </div>
          <button onClick={onCancelReply} className="hover:scale-110 transition-transform" style={{ color: 'var(--text-3)' }}><X size={14} /></button>
        </div>
      )}

      {isAnnounce && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', marginBottom: 8, borderRadius: 12, background: 'rgba(30,144,255,0.1)', border: '1px solid rgba(30,144,255,0.25)' }}>
          <Megaphone size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', flex: 1 }}>Announcement mode — will notify all members</span>
          <button onClick={() => setIsAnnounce(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', padding: 0 }}><X size={14} /></button>
        </div>
      )}

      {showEmoji && (
        <div data-picker className="absolute bottom-16 left-2 z-30 rounded-2xl shadow-xl p-3"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease-out' }}>
          {EMOJI_ROWS.map((row, i) => (
            <div key={i} className="flex gap-1 mb-1">
              {row.map((emoji, idx) => (
                <button key={emoji} onClick={() => insertEmoji(emoji)}
                        className="text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:scale-125 transition-all duration-150 active:scale-95"
                        style={{ background: 'transparent', animation: `popIn 0.15s ease-out ${idx * 0.02}s backwards` }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {emoji}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {showAttach && (
        <div data-picker className="absolute bottom-16 left-12 z-30 rounded-2xl shadow-lg p-2 flex flex-col gap-1"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease-out' }}>
          <AttachBtn icon={Image} label="Photo / Image"   onClick={() => { imageRef.current?.click(); setShowAttach(false) }} />
          <AttachBtn icon={Video} label="Video"           onClick={() => { videoRef.current?.click(); setShowAttach(false) }} />
          <AttachBtn icon={File}  label="File / Document" onClick={() => { fileRef.current?.click();  setShowAttach(false) }} />
        </div>
      )}

      {showMentions && isGroup && mentionCandidates.length > 0 && (
        <div className="absolute z-30 rounded-2xl shadow-lg p-2 flex flex-col gap-1"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', bottom: '64px', left: 12, right: 12, maxHeight: 200, overflowY: 'auto', animation: 'slideUp 0.15s ease-out' }}>
          {mentionCandidates.map((uid, idx) => (
            <button key={uid} onClick={() => insertMention(uid)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, border: 'none', background: idx === mentionIndex ? 'var(--bg-2)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx === mentionIndex ? 'var(--bg-2)' : 'transparent')}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
                {(memberNames[uid] || '?')[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>@{memberNames[uid] || uid}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={imageRef} type="file" accept="image/*"                               className="hidden" onChange={e => handleFileUpload(e, 'image')} />
      <input ref={videoRef} type="file" accept="video/*"                               className="hidden" onChange={e => handleFileUpload(e, 'video')} />
      <input ref={fileRef}  type="file" accept=".pdf,.doc,.docx,.txt,.zip,.xlsx,.pptx" className="hidden" onChange={e => handleFileUpload(e, 'file')} />

      <div className="flex items-end gap-2">
                <button data-picker onClick={() => { setShowEmoji(s => !s); setShowAttach(false) }}
                className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                style={{ color: showEmoji ? 'var(--accent)' : 'var(--text-3)', background: showEmoji ? 'var(--bg-2)' : 'transparent' }}>
          <Smiley size={20} />
        </button>

        <button data-picker onClick={() => { setShowAttach(s => !s); setShowEmoji(false) }}
                className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                style={{ color: showAttach ? 'var(--accent)' : 'var(--text-3)', background: showAttach ? 'var(--bg-2)' : 'transparent' }}>
          <Paperclip size={20} />
        </button>

        {isGroup && (
          <button onClick={() => {
                    const pos  = textareaRef.current?.selectionStart ?? text.length
                    const next = text.slice(0, pos) + '@' + text.slice(pos)
                    setText(next)
                    setTimeout(() => {
                      textareaRef.current?.focus()
                      textareaRef.current?.setSelectionRange(pos + 1, pos + 1)
                    }, 0)
                  }}
                                    className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                  style={{ color: 'var(--text-3)' }} title="Mention someone">
            <At size={20} />
          </button>
        )}

        {isGroup && isAdmin && (
          <button onClick={() => setIsAnnounce(s => !s)}
                  className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                  title="Send announcement"
                  style={{ color: isAnnounce ? 'var(--primary)' : 'var(--text-3)', background: isAnnounce ? 'rgba(30,144,255,0.12)' : 'transparent' }}>
            <Megaphone size={20} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={() => { if (currentUser?.uid) debounceTyping(convId, currentUser.uid, true) }}
          onBlur={() => { if (!isDisabled && currentUser?.uid) setTyping(convId, currentUser.uid, false) }}
          placeholder={disabledMessage ? disabledMessage : isAnnounce ? 'Write announcement…' : 'Message'}
          rows={1}
          disabled={isDisabled}
          className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm outline-none transition-all duration-150 focus:shadow-md"
          style={{ background: 'var(--bg-2)', color: 'var(--text-1)', lineHeight: '1.5', maxHeight: '128px', minHeight: '40px', opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? 'not-allowed' : 'text' }}
        />

                <button onClick={handleSend}
                disabled={loading || !text.trim() || isDisabled}
                className="p-2.5 text-white rounded-full transition-all duration-150 shrink-0 hover:scale-110 active:scale-95"
                style={{ background: accentColor, opacity: loading || !text.trim() || isDisabled ? 0.4 : 1, cursor: loading || !text.trim() || isDisabled ? 'not-allowed' : 'pointer' }}>
          <PaperPlaneRight size={16} />
        </button>
      </div>
    </div>
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractMentionedUids(text, memberNames) {
  if (!text || !memberNames) return []

  const normalized = text.toLowerCase()
  const mentions = Object.entries(memberNames)
    .filter(([, name]) => typeof name === 'string' && name.trim())
    .map(([uid, name]) => ({ uid, name: name.trim().toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length)

  const mentioned = new Set()
  for (const { uid, name } of mentions) {
    const escaped = escapeRegExp(name).replace(/\s+/g, '\\s+')
    const regex = new RegExp(`@${escaped}(?=$|\\s|[.,!?;:\\-_/])`, 'g')
    if (regex.test(normalized)) mentioned.add(uid)
  }

  return [...mentioned]
}

function AttachBtn({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-150 text-left hover:scale-105 active:scale-95"
            style={{ color: 'var(--text-1)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <Icon size={16} style={{ color: 'var(--accent)' }} />
      <span className="font-medium">{label}</span>
    </button>
  )
}