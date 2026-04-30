import { format, isToday, isYesterday } from 'date-fns'

const AVATAR_COLORS = [
  { bg: '#dbeafe', text: '#1d4ed8' },
  { bg: '#ede9fe', text: '#6d28d9' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#fef3c7', text: '#b45309' },
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#ccfbf1', text: '#0f766e' },
  { bg: '#fee2e2', text: '#b91c1c' },
]

export function getAvatarColor(name = '') {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

export function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function formatTime(ts) {
  if (!ts) return ''
  return format(ts.toDate?.() ?? new Date(ts), 'h:mm a')
}

export function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate?.() ?? new Date(ts)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d, yyyy')
}

export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}