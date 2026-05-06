// src/components/TypingIndicator.jsx
// Messenger / IG-style typing indicator.
// Accepts either:
//   names={['Alice', 'Bob']}  — pre-resolved names (from ChatWindow)
//   convId + currentUid       — raw watch mode (legacy)

import { useState, useEffect } from 'react'
import { watchTyping } from '../lib/typing'

export default function TypingIndicator({ names, convId, currentUid }) {
  const [watchedNames, setWatchedNames] = useState([])

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

  const label =
    displayNames.length === 1
      ? `${displayNames[0]} is typing`
      : displayNames.length === 2
      ? `${displayNames[0]} and ${displayNames[1]} are typing`
      : 'Several people are typing'

  return (
    <>
      <style>{CSS}</style>

      <div className="ti-row">
        {/* Avatar stack for multiple typers */}
        {displayNames.length > 1 && (
          <div className="ti-avatars">
            {displayNames.slice(0, 3).map((name, i) => (
              <div
                key={i}
                className="ti-avatar"
                style={{ zIndex: 3 - i, marginLeft: i === 0 ? 0 : '-8px' }}
              >
                {name[0]?.toUpperCase() ?? '?'}
              </div>
            ))}
          </div>
        )}

        {/* Bubble */}
        <div className="ti-bubble">
          {/* Dots */}
          <span className="ti-dot" style={{ animationDelay: '0ms' }} />
          <span className="ti-dot" style={{ animationDelay: '160ms' }} />
          <span className="ti-dot" style={{ animationDelay: '320ms' }} />
        </div>

        {/* Label */}
        <span className="ti-label">{label}</span>
      </div>
    </>
  )
}

// ── Scoped CSS ────────────────────────────────────────────────────────────────

const CSS = `
  /* ── Row wrapper ── */
  .ti-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    animation: ti-slide-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* ── Avatar stack (multi-user) ── */
  .ti-avatars {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .ti-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--bg-4, #2c2c2c);
    border: 2px solid var(--bg-primary, #111);
    color: var(--text-secondary, #999);
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── The bubble ── */
  .ti-bubble {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 10px 14px;
    border-radius: 18px 18px 18px 4px;   /* IG/Messenger left-tail shape */
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border, #252525);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    flex-shrink: 0;
    position: relative;
  }

  /* Subtle inner glow on the bubble */
  .ti-bubble::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      rgba(30, 144, 255, 0.06) 0%,
      transparent 60%
    );
    pointer-events: none;
  }

  /* ── Dots ── */
  .ti-dot {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-secondary, #999);
    animation: ti-bounce 1.1s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
    flex-shrink: 0;
  }

  /* Slight blue tint on the middle dot — Messenger feel */
  .ti-dot:nth-child(2) {
    background: color-mix(in srgb, var(--accent, #1e90ff) 35%, var(--text-secondary, #999));
  }

  /* ── Label ── */
  .ti-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary, #555);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
    animation: ti-fade-in 0.35s ease 0.1s both;
  }

  /* ── Entrance animation ── */
  @keyframes ti-slide-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.92);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes ti-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Dot bounce (staggered via animationDelay inline) ── */
  @keyframes ti-bounce {
    0%, 60%, 100% {
      transform: translateY(0) scale(1);
      opacity: 0.45;
    }
    30% {
      transform: translateY(-5px) scale(1.15);
      opacity: 1;
    }
  }
`