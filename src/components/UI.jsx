import { X, Loader2, EyeOff, Eye } from 'lucide-react'
import { useState } from 'react'
import { getInitials, getAvatarColor } from '../lib/utils'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95'

  const variants = {
    primary:  'bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:shadow-lg text-white',
    secondary:'bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)]',
    ghost:    'hover:bg-[var(--bg-2)] text-[var(--text-2)] hover:text-[var(--text-1)]',
    danger:   'bg-[var(--danger)] hover:opacity-90 text-white hover:shadow-lg',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Input({
  label,
  error,
  type = 'text',
  className = '',
  ...props
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[var(--text-2)]">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={isPassword ? (show ? 'text' : 'password') : type}
          className={`w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-1)] text-[var(--text-1)] text-sm placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent)] focus:shadow-lg transition-all duration-200 ${isPassword ? 'pr-10' : ''} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors duration-150"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)] animate-pulse">{error}</p>
      )}
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div
        className="bg-[var(--bg-1)] rounded-2xl shadow-lg w-full max-w-md mx-4 p-5"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'popIn 0.3s ease-out' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--text-1)] text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-all duration-150 hover:scale-110 active:scale-95"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ size = 20 }) {
  return (
    <Loader2
      size={size}
      className="animate-spin text-[var(--accent)]"
    />
  )
}

export function Avatar({ user, size = 40, showStatus = false }) {
  const name = user?.displayName || user?.username || '?'
  const { bg, text } = getAvatarColor(name)

  return (
    <div className="relative inline-flex shrink-0 transition-transform duration-200 hover:scale-105" style={{ width: size, height: size }}>
      {user?.photoURL ? (
        <img
          src={user.photoURL}
          alt={name}
          className="rounded-full object-cover w-full h-full shadow-sm"
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-medium shadow-sm"
          style={{
            width: size,
            height: size,
            background: bg,
            color: text,
            fontSize: size * 0.35,
          }}
        >
          {getInitials(name)}
        </div>
      )}
      {showStatus && user?.status && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--bg-1)] animate-pulse"
          style={{
            width: size * 0.28,
            height: size * 0.28,
            background:
              user.status === 'online'  ? 'var(--online)'  :
              user.status === 'away'    ? 'var(--away)'    :
              'var(--offline)',
          }}
        />
      )}
    </div>
  )
}

export function Badge({ count }) {
  if (!count) return null
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1">
      {count > 99 ? '99+' : count}
    </span>
  )
}