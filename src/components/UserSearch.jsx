import { useState } from 'react'
import { Search, UserPlus, Check } from 'lucide-react'
import { searchByUsername } from '../services/userService'
import { sendFriendRequest } from '../services/friendService'
import { Avatar } from './UI'

export default function UserSearch({ currentUid }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState({})
  const [error, setError] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      const users = await searchByUsername(query.trim())
      const filtered = users.filter(u => u.uid !== currentUid)
      setResults(filtered)
      if (filtered.length === 0) setError('No user found with that username')
    } catch (err) {
      setError('Something went wrong')
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleAdd = async (uid) => {
    try {
      await sendFriendRequest(currentUid, uid)
      setSent(s => ({ ...s, [uid]: true }))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by username"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent)] focus:shadow-lg transition-all duration-200"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-xl transition-all duration-200 disabled:opacity-50 hover:shadow-lg active:scale-95"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-[var(--text-3)] text-center animate-pulse">{error}</p>
      )}

      {results.length > 0 && (
        <div
          className="flex flex-col gap-2"
          style={{ animation: 'slideUp 0.25s ease-out' }}
        >
          {results.map((user, idx) => (
            <div
              key={user.uid}
              className="flex items-center justify-between bg-[var(--bg-1)] border border-[var(--border)] rounded-xl px-3 py-2.5 transition-all duration-200 hover:shadow-md hover:border-[var(--accent)]"
              style={{ animation: `popIn 0.2s ease-out ${idx * 0.05}s backwards` }}
            >
              <div className="flex items-center gap-3">
                <Avatar user={user} size={40} />
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">
                    @{user.username}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleAdd(user.uid)}
                disabled={sent[user.uid]}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  background: sent[user.uid] ? 'var(--bg-2)' : 'var(--accent-muted)',
                  color: sent[user.uid] ? 'var(--text-3)' : 'var(--accent)',
                  opacity: sent[user.uid] ? 0.6 : 1
                }}
              >
                {sent[user.uid] ? (
                  <>
                    <Check size={13} /> Sent
                  </>
                ) : (
                  <>
                    <UserPlus size={13} /> Add
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}