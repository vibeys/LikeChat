// src/components/TypingIndicator.jsx
// Accepts either:
//   names={['Alice', 'Bob']}  — pre-resolved names (from ChatWindow)
//   convId + currentUid       — raw watch mode (legacy)

import { useState, useEffect } from 'react'
import { watchTyping } from '../lib/typing'

export default function TypingIndicator({ names, convId, currentUid }) {
  const [watchedNames, setWatchedNames] = useState([])

  // Only watch if names not provided directly
  useEffect(() => {
    if (names !== undefined) return
    if (!convId) return
    const unsub = watchTyping(convId, typingMap => {
      const others = Object.keys(typingMap).filter(id => id !== currentUid)
      setWatchedNames(others.map(() => 'Someone'))
    })
    return () => unsub()
  }, [convId, currentUid, names])

  const displayNames = names ?? watchedNames
  if (!displayNames.length) return null

  const label = displayNames.length === 1
    ? `${displayNames[0]} is typing`
    : displayNames.length === 2
      ? `${displayNames[0]} and ${displayNames[1]} are typing`
      : 'Several people are typing'

  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ animation: 'slideUp 0.2s ease-out' }}>
      <div className="flex items-center gap-1 px-3 py-2.5 rounded-full shadow-sm"
           style={{ background: 'var(--bg-secondary)', animation: 'typingAppear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        {[0, 1, 2].map(i => (
          <span key={i}
                className="w-2 h-2 rounded-full inline-block"
                style={{
                  background: 'var(--text-secondary)',
                  animation: `typingBounce 0.8s cubic-bezier(0.65, 0, 0.35, 1) ${i * 0.15}s infinite`,
                }} />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--text-3)', animation: 'fadeIn 0.3s ease-out' }}>{label}</span>
    </div>
  )
}