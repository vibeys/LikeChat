// src/components/MessageInput.jsx
import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Smile, X, Image, Video, File, Megaphone, AtSign } from 'lucide-react'
import { setTyping } from '../lib/typing'
import { sendMessage, uploadFile } from '../services/chatService'
import { debounce } from '../lib/utils'

// Simple inline emoji grid — avoids emoji-mart class constructor crash
const EMOJI_ROWS = [
  ['😀','😂','🥹','😍','😎','🤔','😴','😭'],
  ['😤','🤯','🥰','😇','🤣','😮','😢','🫡'],
  ['👍','👎','❤️','🔥','🎉','💯','✅','👀'],
  ['💀','🙏','🫶','😈','🤝','💪','🎮','🍕'],
]

export default function MessageInput({ convId, currentUser, replyTo, onCancelReply }) {
  const [text, setText]             = useState('')
  const [loading, setLoading]       = useState(false)
  const [showEmoji, setShowEmoji]   = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showMenu, setShowMenu]     = useState(false)
  const [isAnnounce, setIsAnnounce] = useState(false)
  const textareaRef = useRef(null)
  const imageRef    = useRef(null)
  const videoRef    = useRef(null)
  const fileRef     = useRef(null)

  // Debounced stop-typing
  const stopTyping = useRef(
    debounce((cid, uid) => setTyping(cid, uid, false), 1500)
  ).current

  // Close pickers on outside click
  useEffect(() => {
    if (!showEmoji && !showAttach && !showMenu) return
    const handler = (e) => {
      if (!e.target.closest('[data-picker]')) {
        setShowEmoji(false)
        setShowAttach(false)
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmoji, showAttach, showMenu])

  const handleInput = (e) => {
    setText(e.target.value)
    // Auto-grow
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
    if (currentUser?.uid) {
      setTyping(convId, currentUser.uid, true)
      stopTyping(convId, currentUser.uid)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = async () => {
    if (!text.trim() || !currentUser?.uid) return
    setLoading(true)
    const toSend = text.trim()
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    try {
      await sendMessage(convId, {
        senderId: currentUser.uid,
        text:     toSend,
        type:     isAnnounce ? 'announce' : 'text',
        replyTo:  replyTo
          ? { msgId: replyTo.id, text: replyTo.text, senderId: replyTo.senderId }
          : null,
      })
      onCancelReply?.()
      setIsAnnounce(false)
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
    if (!file || !currentUser?.uid) return
    setLoading(true)
    setShowAttach(false)
    try {
      const result  = await uploadFile(file, convId)
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const type    = forcedType || (isImage ? 'image' : isVideo ? 'video' : 'file')
      await sendMessage(convId, {
        senderId: currentUser.uid,
        text:     '',
        type,
        fileURL:  result.url,
        fileName: result.name,
        fileSize: result.size,
        replyTo:  replyTo
          ? { msgId: replyTo.id, text: replyTo.text, senderId: replyTo.senderId }
          : null,
      })
      onCancelReply?.()
    } catch (err) {
      console.error('File upload error:', err)
      // Silently fail — Firestore rules or quota exceeded
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const insertEmoji = (emoji) => {
    setText(t => t + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  return (
    <div className="px-3 py-3 border-t relative"
         style={{ background: 'var(--bg-1)', borderColor: 'var(--border)' }}>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-2 border-l-2"
             style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', animation: 'slideDown 0.2s ease-out' }}>
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Replying</p>
            <p className="text-xs truncate max-w-[260px]" style={{ color: 'var(--text-2)' }}>
              {replyTo.text || '📎 Attachment'}
            </p>
          </div>
          <button onClick={onCancelReply} className="hover:scale-110 transition-transform" style={{ color: 'var(--text-3)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div data-picker
             className="absolute bottom-16 left-2 z-30 rounded-2xl shadow-xl p-3"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease-out' }}>
          {EMOJI_ROWS.map((row, i) => (
            <div key={i} className="flex gap-1 mb-1">
              {row.map((emoji, idx) => (
                <button key={emoji} 
                        onClick={() => insertEmoji(emoji)}
                        className="text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:scale-125 transition-all duration-150 active:scale-95"
                        style={{ background: 'transparent', animation: `popIn 0.15s ease-out ${idx * 0.02}s backwards` }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {emoji}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Attach menu */}
      {showAttach && (
        <div data-picker
             className="absolute bottom-16 left-12 z-30 rounded-2xl shadow-lg p-2 flex flex-col gap-1"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease-out' }}>
          <AttachBtn icon={Image} label="Photo / Image"
                     onClick={() => { imageRef.current?.click(); setShowAttach(false) }} />
          <AttachBtn icon={Video} label="Video"
                     onClick={() => { videoRef.current?.click(); setShowAttach(false) }} />
          <AttachBtn icon={File}  label="File / Document"
                     onClick={() => { fileRef.current?.click(); setShowAttach(false) }} />
        </div>
      )}

      {/* Announcement/Mention menu */}
      {showMenu && (
        <div data-picker
             className="absolute bottom-16 left-20 z-30 rounded-2xl shadow-lg p-2 flex flex-col gap-1"
             style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', animation: 'slideUp 0.2s ease-out' }}>
          <AttachBtn icon={Megaphone} label={isAnnounce ? '✓ Announce' : 'Announce'}
                     onClick={() => { setIsAnnounce(!isAnnounce); setShowMenu(false) }} />
          <AttachBtn icon={AtSign} label="@Mention" 
                     onClick={() => { setText(text + '@'); setShowMenu(false) }} />
        </div>
      )}

      {/* Hidden inputs */}
      <input ref={imageRef} type="file" accept="image/*" className="hidden"
             onChange={e => handleFileUpload(e, 'image')} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden"
             onChange={e => handleFileUpload(e, 'video')} />
      <input ref={fileRef}  type="file" accept=".pdf,.doc,.docx,.txt,.zip,.xlsx,.pptx" className="hidden"
             onChange={e => handleFileUpload(e, 'file')} />

      {/* Input row */}
      <div className="flex items-end gap-2">
        <button data-picker
                onClick={() => { setShowEmoji(s => !s); setShowAttach(false) }}
                className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                style={{ color: showEmoji ? 'var(--accent)' : 'var(--text-3)', background: showEmoji ? 'var(--bg-2)' : 'transparent' }}>
          <Smile size={20} />
        </button>

        <button data-picker
                onClick={() => { setShowAttach(s => !s); setShowEmoji(false) }}
                className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                style={{ color: showAttach ? 'var(--accent)' : 'var(--text-3)', background: showAttach ? 'var(--bg-2)' : 'transparent' }}>
          <Paperclip size={20} />
        </button>

        <button data-picker
                onClick={() => { setShowMenu(s => !s); setShowEmoji(false); setShowAttach(false) }}
                className="p-2 transition-all duration-150 hover:scale-110 active:scale-95 rounded-lg shrink-0"
                style={{ color: showMenu ? 'var(--accent)' : 'var(--text-3)', background: showMenu ? 'var(--bg-2)' : 'transparent' }}>
          <Megaphone size={20} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          rows={1}
          className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm outline-none transition-all duration-150 focus:shadow-md"
          style={{
            background: 'var(--bg-2)',
            color:      'var(--text-1)',
            lineHeight: '1.5',
            maxHeight:  '128px',
            minHeight:  '40px',
          }}
        />

        <button onClick={handleSend}
                disabled={loading || !text.trim()}
                className="p-2.5 text-white rounded-full transition-all duration-150 shrink-0 hover:scale-110 active:scale-95"
                style={{
                  background: isAnnounce ? 'var(--primary)' : 'var(--accent)',
                  opacity: loading || !text.trim() ? 0.4 : 1,
                  cursor:  loading || !text.trim() ? 'not-allowed' : 'pointer',
                }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

function AttachBtn({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-150 text-left hover:scale-105 active:scale-95"
            style={{ color: 'var(--text-1)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <Icon size={16} style={{ color: 'var(--accent)' }} />
      <span className="font-medium">{label}</span>
    </button>
  )
}