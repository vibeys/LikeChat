// src/pages/app/GroupPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { getConversation, updateGroupInfo } from '../../services/chatService'
import { searchByUsername } from '../../services/userService'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { getInitials, getAvatarColor } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  ArrowLeft,
  Camera,
  Check,
  Crown,
  LogOut,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function GroupPage() {
  const { convId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [convo, setConvo] = useState(null)

  const [tab, setTab] = useState('info')
  const [groupName, setGroupName] = useState('')
  const [groupPhoto, setGroupPhoto] = useState('')
  const [photoFile, setPhotoFile] = useState(null)

  const [searchQ, setSearchQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])

  const isAdmin = useMemo(
    () => !!convo?.admins?.includes(user?.uid),
    [convo?.admins, user?.uid]
  )

  useEffect(() => {
    let alive = true

    async function load() {
      if (!convId) return
      setLoading(true)
      try {
        const data = await getConversation(convId)
        if (!alive) return

        if (!data || data.type !== 'group') {
          navigate('/app/chats', { replace: true })
          return
        }

        setConvo(data)
        setGroupName(data.groupName || '')
        setGroupPhoto(data.groupPhoto || '')
        setLoading(false)
      } catch {
        if (alive) {
          toast.error('Failed to load group')
          navigate('/app/chats', { replace: true })
        }
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [convId, navigate])

  useEffect(() => {
    return () => {
      if (groupPhoto?.startsWith('blob:')) URL.revokeObjectURL(groupPhoto)
    }
  }, [groupPhoto])

  function onPickPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const preview = URL.createObjectURL(file)
    setGroupPhoto(preview)
  }

  function toggleSelect(uid) {
    setSelected(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)

    if (!q.trim()) {
      setResults([])
      return
    }

    setSearching(true)
    try {
      const res = await searchByUsername(q.trim())
      const list = Array.isArray(res) ? res : []
      setResults(list.filter(u => !convo?.members?.includes(u.uid) && u.uid !== user.uid))
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleSaveInfo() {
    if (!isAdmin) return
    if (!groupName.trim()) {
      toast.error('Group name is required')
      return
    }

    setSaving(true)
    try {
      let finalPhoto = convo?.groupPhoto || ''

      if (photoFile) {
        finalPhoto = await uploadToCloudinary(photoFile)
      } else if (groupPhoto && !groupPhoto.startsWith('blob:')) {
        finalPhoto = groupPhoto
      }

      await updateGroupInfo(convId, {
        groupName: groupName.trim(),
        groupPhoto: finalPhoto,
      })

      setConvo(prev => ({
        ...prev,
        groupName: groupName.trim(),
        groupPhoto: finalPhoto,
      }))

      setPhotoFile(null)
      toast.success('Group updated')
    } catch {
      toast.error('Failed to update group')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMembers() {
    if (!isAdmin) return
    if (!selected.length) {
      toast.error('Select at least one member')
      return
    }

    setSaving(true)
    try {
      const newMembers = [...new Set([...(convo?.members || []), ...selected])]
      const newNames = { ...(convo?.memberNames || {}) }
      const newPhotos = { ...(convo?.memberPhotos || {}) }

      for (const uid of selected) {
        const found = results.find(u => u.uid === uid)
        if (found) {
          newNames[uid] = found.displayName || found.username || 'Unknown'
          newPhotos[uid] = found.photoURL || ''
        }
      }

      await updateGroupInfo(convId, {
        members: newMembers,
        memberNames: newNames,
        memberPhotos: newPhotos,
      })

      setConvo(prev => ({
        ...prev,
        members: newMembers,
        memberNames: newNames,
        memberPhotos: newPhotos,
      }))

      setSelected([])
      setSearchQ('')
      setResults([])
      setTab('members')
      toast.success(`${selected.length} member${selected.length === 1 ? '' : 's'} added`)
    } catch {
      toast.error('Failed to add members')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(uid) {
    if (!isAdmin) return
    if (uid === user.uid) {
      toast.error('Use Leave Group for yourself')
      return
    }

    const memberName = convo?.memberNames?.[uid] || 'this member'
    if (!window.confirm(`Remove ${memberName} from the group?`)) return

    setSaving(true)
    try {
      const newMembers = (convo?.members || []).filter(m => m !== uid)
      const newAdmins = (convo?.admins || []).filter(a => a !== uid)

      await updateGroupInfo(convId, {
        members: newMembers,
        admins: newAdmins,
      })

      setConvo(prev => ({
        ...prev,
        members: newMembers,
        admins: newAdmins,
      }))

      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleAdmin(uid) {
    if (!isAdmin) return
    if (uid === user.uid) return

    setSaving(true)
    try {
      const isAdminNow = convo?.admins?.includes(uid)
      const newAdmins = isAdminNow
        ? (convo?.admins || []).filter(a => a !== uid)
        : [...new Set([...(convo?.admins || []), uid])]

      await updateGroupInfo(convId, { admins: newAdmins })

      setConvo(prev => ({
        ...prev,
        admins: newAdmins,
      }))

      toast.success(isAdminNow ? 'Admin removed' : 'Promoted to admin')
    } catch {
      toast.error('Failed to update admin')
    } finally {
      setSaving(false)
    }
  }

  async function handleLeaveGroup() {
    if (!window.confirm('Leave this group?')) return

    setSaving(true)
    try {
      const newMembers = (convo?.members || []).filter(m => m !== user.uid)
      const newAdmins = (convo?.admins || []).filter(a => a !== user.uid)

      await updateGroupInfo(convId, {
        members: newMembers,
        admins: newAdmins,
      })

      toast.success('You left the group')
      navigate('/app/chats', { replace: true })
    } catch {
      toast.error('Failed to leave group')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteGroup() {
    if (!isAdmin) return
    if (!window.confirm('Delete this group for everyone? This cannot be undone.')) return

    setSaving(true)
    try {
      await updateGroupInfo(convId, { deleted: true })
      toast.success('Group deleted')
      navigate('/app/chats', { replace: true })
    } catch {
      toast.error('Failed to delete group')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.center}>
          <Spinner />
        </div>
      </div>
    )
  }

  if (!convo) {
    return (
      <div style={styles.page}>
        <div style={styles.center}>
          <p style={{ color: 'var(--text-tertiary)' }}>Group not found.</p>
        </div>
      </div>
    )
  }

  const members = convo?.members || []
  const admins = convo?.admins || []
  const canEdit = isAdmin

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn} title="Back">
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={styles.title}>Group Settings</h1>
          <p style={styles.subtitle}>
            Manage the group, members, and permissions
          </p>
        </div>

        {canEdit && (
          <button onClick={handleSaveInfo} disabled={saving} style={styles.primaryBtn}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        )}
      </div>

      <div style={styles.tabs}>
        <TabButton active={tab === 'info'} onClick={() => setTab('info')}>Info</TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          Members
        </TabButton>
        {canEdit && (
          <TabButton active={tab === 'add'} onClick={() => setTab('add')}>
            + Add
          </TabButton>
        )}
      </div>

      <div style={styles.content}>
        {tab === 'info' && (
          <div style={styles.sectionCard}>
            <div style={styles.photoWrap}>
              <button
                type="button"
                onClick={() => canEdit && fileRef.current?.click()}
                style={{
                  ...styles.photoButton,
                  cursor: canEdit ? 'pointer' : 'default',
                }}
                title={canEdit ? 'Change group photo' : 'Group photo'}
              >
                {groupPhoto ? (
                  <img
                    src={groupPhoto}
                    alt={groupName}
                    style={styles.photoImg}
                  />
                ) : (
                  <div style={{ ...styles.photoFallback, background: getAvatarColor(groupName).bg, color: getAvatarColor(groupName).text }}>
                    {getInitials(groupName || 'Group')}
                  </div>
                )}

                {canEdit && (
                  <span style={styles.photoOverlay}>
                    <Camera size={18} />
                  </span>
                )}
              </button>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                style={{ display: 'none' }}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Group name</label>
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                disabled={!canEdit}
                placeholder="Enter group name"
                style={{
                  ...styles.input,
                  opacity: canEdit ? 1 : 0.85,
                }}
              />
            </div>

            <div style={styles.infoGrid}>
              <InfoCard label="Members" value={members.length} />
              <InfoCard label="Admins" value={admins.length || 0} />
            </div>

            <div style={styles.actionRow}>
              <button onClick={() => setTab('members')} style={styles.secondaryBtn}>
                View members
              </button>

              {canEdit ? (
                <>
                  <button onClick={handleLeaveGroup} style={styles.warningBtn}>
                    <LogOut size={16} />
                    Leave group
                  </button>
                  <button onClick={handleDeleteGroup} style={styles.dangerBtn}>
                    <Trash2 size={16} />
                    Delete group
                  </button>
                </>
              ) : (
                <button onClick={handleLeaveGroup} style={styles.warningBtn}>
                  <LogOut size={16} />
                  Leave group
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Members</h2>
                <p style={styles.sectionSub}>
                  {members.length} member{members.length === 1 ? '' : 's'} total
                </p>
              </div>
            </div>

            <div style={styles.memberList}>
              {members.map(uid => {
                const name = convo?.memberNames?.[uid] || 'Unknown user'
                const photo = convo?.memberPhotos?.[uid]
                const admin = admins.includes(uid)
                const me = uid === user.uid
                const ac = getAvatarColor(name)

                return (
                  <div key={uid} style={styles.memberCard}>
                    {photo ? (
                      <img src={photo} alt={name} style={styles.memberAvatar} />
                    ) : (
                      <div style={{ ...styles.memberAvatar, background: ac.bg, color: ac.text }}>
                        {getInitials(name)}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.memberNameRow}>
                        <span style={styles.memberName}>{name}</span>
                        {me && <span style={styles.youPill}>You</span>}
                      </div>

                      <div style={styles.memberMeta}>
                        @{convo?.memberUsernames?.[uid] || uid.slice(0, 8)}
                      </div>

                      <div style={styles.memberBadges}>
                        {admin && (
                          <span style={styles.adminPill}>
                            <Crown size={12} />
                            Admin
                          </span>
                        )}
                      </div>
                    </div>

                    {canEdit && !me && (
                      <div style={styles.memberActions}>
                        <button
                          onClick={() => handleToggleAdmin(uid)}
                          style={styles.iconActionBtn}
                          title={admin ? 'Remove admin' : 'Make admin'}
                        >
                          <Crown size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(uid)}
                          style={{ ...styles.iconActionBtn, ...styles.iconActionDanger }}
                          title="Remove member"
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'add' && canEdit && (
          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Add members</h2>
                <p style={styles.sectionSub}>
                  Search users and add them to this group
                </p>
              </div>

              {selected.length > 0 && (
                <button
                  onClick={handleAddMembers}
                  disabled={saving}
                  style={styles.primaryBtn}
                >
                  {saving ? 'Adding...' : `Add ${selected.length}`}
                </button>
              )}
            </div>

            <div style={styles.searchBar}>
              <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <input
                value={searchQ}
                onChange={handleSearch}
                placeholder="Search by username..."
                style={styles.searchInput}
                autoFocus
              />
              {searching && <Spinner size={14} />}
            </div>

            {selected.length > 0 && (
              <div style={styles.selectedRow}>
                <span style={styles.selectedText}>
                  {selected.length} selected
                </span>
                <button onClick={() => setSelected([])} style={styles.clearBtn}>
                  Clear
                </button>
              </div>
            )}

            <div style={styles.resultList}>
              {searchQ.trim() && !searching && results.length === 0 ? (
                <EmptySearch text="No users found." />
              ) : (
                results.map((u, idx) => {
                  const isSelected = selected.includes(u.uid)
                  const ac = getAvatarColor(u.displayName || u.username || '')

                  return (
                    <button
                      key={u.uid}
                      onClick={() => toggleSelect(u.uid)}
                      style={{
                        ...styles.resultCard,
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        background: isSelected ? 'var(--primary-light)' : 'var(--bg-primary)',
                        animationDelay: `${idx * 0.04}s`,
                      }}
                    >
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName} style={styles.resultAvatar} />
                      ) : (
                        <div style={{ ...styles.resultAvatar, background: ac.bg, color: ac.text }}>
                          {getInitials(u.displayName || u.username || '?')}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.memberName}>{u.displayName || 'Unknown user'}</div>
                        <div style={styles.memberMeta}>@{u.username || u.uid.slice(0, 8)}</div>
                      </div>

                      <div style={styles.resultRight}>
                        {isSelected ? (
                          <span style={styles.checkPill}>
                            <Check size={13} />
                          </span>
                        ) : (
                          <span style={styles.addPill}>
                            <Plus size={13} />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {tab === 'add' && !canEdit && (
          <div style={styles.sectionCard}>
            <EmptySearch text="Only group admins can add members." />
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        borderColor: active ? 'var(--primary)' : 'var(--border)',
      }}
    >
      {children}
    </button>
  )
}

function InfoCard({ label, value }) {
  return (
    <div style={styles.infoCard}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  )
}

function EmptySearch({ text }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIconWrap}>
        <Search size={34} />
      </div>
      <div style={styles.emptyTitle}>Nothing here</div>
      <div style={styles.emptyText}>{text}</div>
    </div>
  )
}

const styles = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 18px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
  },
  backBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  primaryBtn: {
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  secondaryBtn: {
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  warningBtn: {
    border: '1px solid rgba(245, 158, 11, 0.26)',
    background: 'rgba(245, 158, 11, 0.08)',
    color: 'var(--text-primary)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  dangerBtn: {
    border: '1px solid rgba(239, 68, 68, 0.28)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: 'var(--text-primary)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    padding: '12px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    flexShrink: 0,
    overflowX: 'auto',
  },
  tabBtn: {
    border: '1px solid',
    borderRadius: '999px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 18px 18px',
  },
  sectionCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 1px 0 rgba(255,255,255,0.02)',
  },
  photoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  photoButton: {
    width: '108px',
    height: '108px',
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    position: 'relative',
    padding: 0,
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '50%',
    border: '1px solid var(--border)',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    fontWeight: 900,
    border: '1px solid var(--border)',
  },
  photoOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.28)',
    color: '#fff',
    opacity: 0,
    transition: 'opacity 0.15s ease',
  },
  fieldBlock: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 800,
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 13px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '16px',
  },
  infoCard: {
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    borderRadius: '14px',
    padding: '14px',
  },
  infoLabel: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    fontWeight: 700,
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '18px',
    color: 'var(--text-primary)',
    fontWeight: 900,
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 900,
    color: 'var(--text-primary)',
  },
  sectionSub: {
    margin: '3px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  memberList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  memberCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  memberAvatar: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  memberNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  memberName: {
    fontSize: '14px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  memberMeta: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    marginTop: '2px',
  },
  memberBadges: {
    display: 'flex',
    gap: '6px',
    marginTop: '6px',
    flexWrap: 'wrap',
  },
  youPill: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--primary)',
    background: 'var(--primary-light)',
    borderRadius: '999px',
    padding: '4px 8px',
    flexShrink: 0,
  },
  adminPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--primary)',
    background: 'var(--primary-light)',
    borderRadius: '999px',
    padding: '4px 8px',
  },
  memberActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  iconActionBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionDanger: {
    color: 'var(--danger)',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    background: 'var(--bg-secondary)',
    padding: '11px 12px',
    marginBottom: '12px',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '14px',
    flex: 1,
    minWidth: 0,
    padding: 0,
  },
  selectedRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  selectedText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 700,
  },
  clearBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--primary)',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  resultCard: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderRadius: '16px',
    border: '1px solid',
    padding: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  resultAvatar: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },
  resultRight: {
    flexShrink: 0,
  },
  checkPill: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'var(--primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPill: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'var(--bg-secondary)',
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: '220px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px 12px',
  },
  emptyIconWrap: {
    width: '68px',
    height: '68px',
    borderRadius: '20px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  emptyTitle: {
    fontSize: '17px',
    fontWeight: 900,
    color: 'var(--text-primary)',
    marginBottom: '6px',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-tertiary)',
    maxWidth: '320px',
    lineHeight: 1.5,
  },
}