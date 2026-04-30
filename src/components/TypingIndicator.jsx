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
    <div className="flex items-center gap-2 px-4 py-1">
      <div className="flex items-center gap-1 px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm"
           style={{ background: 'var(--bg-1)' }}>
        {[0, 1, 2].map(i => (
          <span key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: 'var(--text-3)',
                  animation: 'typingBounce 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
    </div>
  )
}