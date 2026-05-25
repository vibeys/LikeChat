// src/pages/app/GroupPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import {
  collection,
  deleteDoc,
  doc as fsDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  deleteGroupConversation,
  inviteGroupMembers,
  leaveGroup,
  removeGroupMember,
  toggleMute,
  togglePin,
  updateGroupInfo,
} from '../../services/chatService'
import { searchByUsername } from '../../services/userService'
import { uploadToCloudinary } from '../../lib/cloudinary'
import { getInitials, getAvatarColor } from '../../lib/utils'
import { Spinner } from '../../components/UI'
import {
  ArrowLeft,
  Camera,
  Check,
  Crown,
  Copy,
  SignOut,
  Plus,
  MagnifyingGlass,
  ShieldCheck,
  Trash,
  UserMinus,
  X,
  BellSlash,
  Bell,
  PushPin,
  PushPinSlash,
  Users,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'

export default function GroupPage() {
  const { convId } = useParams()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const fileRef    = useRef(null)

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [toggling, setToggling]   = useState(false) // separate state for pin/mute so it doesn't lock Save
  const [convo, setConvo]         = useState(null)

  const [tab, setTab]             = useState('info')
  const [groupName, setGroupName] = useState('')
  const [groupPhoto, setGroupPhoto] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoHover, setPhotoHover] = useState(false)

  const [searchQ, setSearchQ]     = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults]     = useState([])
  const [selected, setSelected]   = useState([])

  const isAdmin = useMemo(
    () => !!convo?.admins?.includes(user?.uid),
    [convo?.admins, user?.uid]
  )

  const isPinned = useMemo(
    () => !!convo?.pinnedBy?.includes(user?.uid),
    [convo?.pinnedBy, user?.uid]
  )

  const isMuted = useMemo(
    () => !!convo?.mutedBy?.includes(user?.uid),
    [convo?.mutedBy, user?.uid]
  )

  useEffect(() => {
    if (!convId) {
      navigate('/app/chats', { replace: true })
      return
    }

    setLoading(true)

    const ref  = fsDoc(db, 'conversations', convId)
    const unsub = onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) {
          navigate('/app/chats', { replace: true })
          return
        }

        const data = { id: snap.id, ...snap.data() }

        if (data.type !== 'group') {
          navigate('/app/chats', { replace: true })
          return
        }

        const members = data.members        || []
        const pending = data.pendingMembers  || []
        const admins  = data.admins          || []
        const visibleToMe =
          members.includes(user?.uid) ||
          pending.includes(user?.uid) ||
          admins.includes(user?.uid)

        if (!visibleToMe && user?.uid) {
          navigate('/app/chats', { replace: true })
          return
        }

        setConvo(data)
        setGroupName(prev =>
          prev && prev !== data.groupName ? prev : (data.groupName || '')
        )
        setGroupPhoto(prev => {
          if (photoFile) return prev
          return data.groupPhoto || ''
        })
        setLoading(false)
      },
      err => {
        console.error('Group snapshot error:', err)
        toast.error('Failed to load group')
        navigate('/app/chats', { replace: true })
      }
    )

    return () => unsub()
  }, [convId, navigate, photoFile, user?.uid])

  useEffect(() => {
    return () => {
      if (groupPhoto?.startsWith('blob:')) URL.revokeObjectURL(groupPhoto)
    }
  }, [groupPhoto])

  function onPickPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setGroupPhoto(URL.createObjectURL(file))
  }

  function toggleSelect(uid) {
    setSelected(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)

    if (!q.trim()) { setResults([]); return }

    setSearching(true)
    try {
      const res = await searchByUsername(q.trim())
      const list = Array.isArray(res) ? res : []
      const currentMembers = convo?.members        || []
      const currentPending = convo?.pendingMembers  || []

      setResults(
        list.filter(
          u =>
            u.uid !== user.uid &&
            !currentMembers.includes(u.uid) &&
            !currentPending.includes(u.uid)
        )
      )
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleSaveInfo() {
    if (!isAdmin) return
    if (!groupName.trim()) { toast.error('Group name is required'); return }

    setSaving(true)
    try {
      let finalPhoto = convo?.groupPhoto || ''

      if (photoFile) {
        finalPhoto = await uploadToCloudinary(photoFile, 'groups')
      } else if (groupPhoto && !groupPhoto.startsWith('blob:')) {
        finalPhoto = groupPhoto
      }

      await updateGroupInfo(convId, {
        groupName: groupName.trim(),
        groupPhoto: finalPhoto,
      })

      setPhotoFile(null)
      toast.success('Group updated')
    } catch (err) {
      toast.error(err?.message || 'Failed to update group')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMembers() {
    if (!isAdmin) return
    if (!selected.length) { toast.error('Select at least one member'); return }

    setSaving(true)
    try {
      const newNames  = { ...(convo?.memberNames  || {}) }
      const newPhotos = { ...(convo?.memberPhotos || {}) }

      for (const uid of selected) {
        const found = results.find(u => u.uid === uid)
        if (found) {
          newNames[uid]  = found.displayName || found.username || 'Unknown'
          newPhotos[uid] = found.photoURL || ''
        }
      }

      await inviteGroupMembers(convId, user.uid, selected, newNames, newPhotos)

      setSelected([])
      setSearchQ('')
      setResults([])
      setTab('members')
      toast.success(`${selected.length} invite${selected.length === 1 ? '' : 's'} sent`)
    } catch (err) {
      toast.error(err?.message || 'Failed to invite members')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelInvite(uid) {
    if (!isAdmin) return

    setSaving(true)
    try {
      const nextPending = (convo?.pendingMembers || []).filter(id => id !== uid)
      await updateGroupInfo(convId, { pendingMembers: nextPending })

      // Also delete the pending invite notification for that user
      const q    = query(
        collection(db, 'notifications', uid, 'items'),
        where('convId', '==', convId)
      )
      const snap = await getDocs(q)
      for (const d of snap.docs.filter(d => d.data()?.type === 'group_invite')) {
        await deleteDoc(d.ref)
      }

      toast.success('Invite canceled')
    } catch (err) {
      toast.error(err?.message || 'Failed to cancel invite')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(uid) {
    if (!isAdmin) return
    if (uid === user.uid) { toast.error('Use Leave Group for yourself'); return }

    const memberName = convo?.memberNames?.[uid] || 'this member'
    if (!window.confirm(`Remove ${memberName} from the group?`)) return

    setSaving(true)
    try {
      await removeGroupMember(convId, uid)
      toast.success('Member removed')
    } catch (err) {
      toast.error(err?.message || 'Failed to remove member')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleAdmin(uid) {
    if (!isAdmin || uid === user.uid) return

    setSaving(true)
    try {
      const currentAdmins = convo?.admins || []
      const nextAdmins = currentAdmins.includes(uid)
        ? currentAdmins.filter(a => a !== uid)
        : [...new Set([...currentAdmins, uid])]

      await updateGroupInfo(convId, { admins: nextAdmins })
      toast.success(currentAdmins.includes(uid) ? 'Admin removed' : 'Promoted to admin')
    } catch (err) {
      toast.error(err?.message || 'Failed to update admin')
    } finally {
      setSaving(false)
    }
  }

  async function handleLeaveGroup() {
    if (!window.confirm('Leave this group?')) return

    setSaving(true)
    try {
      await leaveGroup(convId, user.uid)
      toast.success('You left the group')
      navigate('/app/chats', { replace: true })
    } catch (err) {
      toast.error(err?.message || 'Failed to leave group')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteGroup() {
    if (!isAdmin) return
    if (!window.confirm('Delete this group for everyone? This cannot be undone.')) return

    setSaving(true)
    try {
      await deleteGroupConversation(convId)
      toast.success('Group deleted')
      navigate('/app/chats', { replace: true })
    } catch (err) {
      toast.error(err?.message || 'Failed to delete group')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyGroupId() {
    try {
      await navigator.clipboard.writeText(convId)
      toast.success('Group ID copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  async function handleTogglePin() {
    if (!convo?.id) return
    setToggling(true)
    try {
      await togglePin(convo.id, user.uid, !isPinned)
      toast.success(isPinned ? 'Unpinned' : 'Pinned')
    } catch (err) {
      toast.error(err?.message || 'Failed to update pin')
    } finally {
      setToggling(false)
    }
  }

  async function handleToggleMute() {
    if (!convo?.id) return
    setToggling(true)
    try {
      await toggleMute(convo.id, user.uid, !isMuted)
      toast.success(isMuted ? 'Unmuted' : 'Muted')
    } catch (err) {
      toast.error(err?.message || 'Failed to update mute')
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.center}><Spinner /></div>
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

  const members        = convo?.members        || []
  const admins         = convo?.admins         || []
  const pendingMembers = convo?.pendingMembers  || []
  const canEdit        = isAdmin

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn} title="Back">
          <ArrowLeft size={18} />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={styles.pageTitle}>Group Settings</h1>
          <p style={styles.subtitle}>Manage members, permissions, and group details</p>
        </div>

        {canEdit && (
          <button
            onClick={handleSaveInfo}
            disabled={saving}
            style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={styles.tabs}>
        <TabButton active={tab === 'info'}    onClick={() => setTab('info')}>Info</TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          Members ({members.length})
        </TabButton>
        {canEdit && (
          <TabButton active={tab === 'add'} onClick={() => setTab('add')}>+ Invite</TabButton>
        )}
      </div>

      <div style={styles.content}>

        {/* ── Info tab ── */}
        {tab === 'info' && (
          <div style={styles.sectionCard}>
            {/* Photo */}
            <div style={styles.photoWrap}>
              <button
                type="button"
                onClick={() => canEdit && fileRef.current?.click()}
                onMouseEnter={() => setPhotoHover(true)}
                onMouseLeave={() => setPhotoHover(false)}
                style={{
                  ...styles.photoButton,
                  cursor: canEdit ? 'pointer' : 'default',
                }}
                title={canEdit ? 'Change group photo' : 'Group photo'}
              >
                {groupPhoto ? (
                  <img src={groupPhoto} alt={groupName} style={styles.photoImg} />
                ) : (
                  <div style={{
                    ...styles.photoFallback,
                    background: getAvatarColor(groupName).bg,
                    color:      getAvatarColor(groupName).text,
                  }}>
                    {getInitials(groupName || 'Group')}
                  </div>
                )}

                {canEdit && (
                  <span style={{
                    ...styles.photoOverlay,
                    opacity: photoHover ? 1 : 0,
                  }}>
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

            {/* Group name */}
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Group name</label>
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                disabled={!canEdit}
                placeholder="Enter group name"
                style={{ ...styles.input, opacity: canEdit ? 1 : 0.75 }}
              />
            </div>

            {/* Stats */}
            <div style={styles.infoGrid}>
              <InfoCard label="Members" value={members.length} />
              <InfoCard label="Admins"  value={admins.length}  />
            </div>

            {/* Actions */}
            <div style={styles.actionRow}>
                            <button onClick={handleCopyGroupId} style={styles.secondaryBtn}>
                <Copy size={16} weight="bold" /> Copy ID
              </button>

                            <button
                onClick={handleTogglePin}
                disabled={toggling}
                style={{ ...styles.secondaryBtn, opacity: toggling ? 0.6 : 1 }}
              >
                {isPinned ? <PushPinSlash size={16} weight="bold" /> : <PushPin size={16} weight="bold" />}
                {isPinned ? 'Unpin' : 'Pin'}
              </button>

              <button
                onClick={handleToggleMute}
                disabled={toggling}
                style={{ ...styles.secondaryBtn, opacity: toggling ? 0.6 : 1 }}
              >
                {isMuted ? <Bell size={16} weight="bold" /> : <BellSlash size={16} weight="bold" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>

              <button onClick={() => setTab('members')} style={styles.secondaryBtn}>
                <Users size={16} weight="bold" /> Members
              </button>

              <button
                onClick={handleLeaveGroup}
                disabled={saving}
                style={{ ...styles.warningBtn, opacity: saving ? 0.6 : 1 }}
              >
                <SignOut size={16} weight="bold" /> Leave group
              </button>

              {/* Only admins see Delete */}
              {canEdit && (
                <button
                  onClick={handleDeleteGroup}
                  disabled={saving}
                  style={{ ...styles.dangerBtn, opacity: saving ? 0.6 : 1 }}
                >
                  <Trash size={16} weight="bold" /> Delete group
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Members tab ── */}
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
                const name  = convo?.memberNames?.[uid]  || 'Unknown user'
                const photo = convo?.memberPhotos?.[uid]
                const admin = admins.includes(uid)
                const me    = uid === user.uid
                const ac    = getAvatarColor(name)

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
                        {me    && <span style={styles.youPill}>You</span>}
                        {admin && (
                          <span style={styles.adminPill}>
                            <Crown size={11} /> Admin
                          </span>
                        )}
                      </div>
                      <div style={styles.memberMeta}>
                        @{convo?.memberUsernames?.[uid] || uid.slice(0, 8)}
                      </div>
                    </div>

                    {canEdit && !me && (
                      <div style={styles.memberActions}>
                                                <button
                          onClick={() => handleToggleAdmin(uid)}
                          style={styles.iconActionBtn}
                          title={admin ? 'Remove admin' : 'Make admin'}
                        >
                          <ShieldCheck size={16} weight="bold" />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(uid)}
                          style={{ ...styles.iconActionBtn, ...styles.iconActionDanger }}
                          title="Remove member"
                        >
                          <UserMinus size={16} weight="bold" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pending invites section */}
            {pendingMembers.length > 0 && (
              <>
                <div style={{ height: '20px' }} />
                <div style={styles.sectionHeader}>
                  <div>
                    <h2 style={styles.sectionTitle}>Pending invites</h2>
                    <p style={styles.sectionSub}>
                      {pendingMembers.length} invite{pendingMembers.length === 1 ? '' : 's'} waiting
                    </p>
                  </div>
                </div>

                <div style={styles.memberList}>
                  {pendingMembers.map(uid => {
                    const name  = convo?.memberNames?.[uid]  || 'Pending user'
                    const photo = convo?.memberPhotos?.[uid]
                    const ac    = getAvatarColor(name)

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
                            <span style={styles.pendingPill}>Pending</span>
                          </div>
                          <div style={styles.memberMeta}>
                            Invite sent · @{convo?.memberUsernames?.[uid] || uid.slice(0, 8)}
                          </div>
                        </div>

                        {canEdit && (
                          <div style={styles.memberActions}>
                                                        <button
                              onClick={() => handleCancelInvite(uid)}
                              style={{ ...styles.iconActionBtn, ...styles.iconActionDanger }}
                              title="Cancel invite"
                            >
                              <X size={16} weight="bold" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Add/Invite tab ── */}
        {tab === 'add' && canEdit && (
          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Invite members</h2>
                <p style={styles.sectionSub}>Search users and send a pending invite</p>
              </div>
              {selected.length > 0 && (
                <button onClick={handleAddMembers} disabled={saving} style={styles.primaryBtn}>
                  {saving ? 'Inviting...' : `Invite ${selected.length}`}
                </button>
              )}
            </div>

                        <div style={styles.searchBar}>
              <MagnifyingGlass size={16} weight="bold" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
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
                <span style={styles.selectedText}>{selected.length} selected</span>
                <button onClick={() => setSelected([])} style={styles.clearBtn}>Clear</button>
              </div>
            )}

            <div style={styles.resultList}>
              {searchQ.trim() && !searching && results.length === 0 ? (
                <EmptySearch text="No users found." />
              ) : (
                results.map((u, idx) => {
                  const isSelected = selected.includes(u.uid)
                  const ac         = getAvatarColor(u.displayName || u.username || '')

                  return (
                    <button
                      key={u.uid}
                      onClick={() => toggleSelect(u.uid)}
                      style={{
                        ...styles.resultCard,
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        background:  isSelected ? 'var(--primary-light)' : 'var(--bg-primary)',
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
                          <span style={styles.checkPill}><Check size={13} weight="bold" /></span>
                        ) : (
                          <span style={styles.addPill}><Plus size={13} weight="bold" /></span>
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
            <EmptySearch text="Only group admins can invite members." />
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
        background:  active ? 'var(--primary)' : 'transparent',
        color:       active ? '#fff' : 'var(--text-secondary)',
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
      <div style={styles.emptyIconWrap}><MagnifyingGlass size={34} weight="light" /></div>
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
  pageTitle: {
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
    transition: 'opacity 0.15s',
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
    transition: 'opacity 0.15s',
  },
  warningBtn: {
    border: '1px solid rgba(245,158,11,0.26)',
    background: 'rgba(245,158,11,0.08)',
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
    transition: 'opacity 0.15s',
  },
  dangerBtn: {
    border: '1px solid rgba(239,68,68,0.28)',
    background: 'rgba(239,68,68,0.08)',
    color: 'var(--danger, #ef4444)',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'opacity 0.15s',
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
    background: 'rgba(0,0,0,0.38)',
    color: '#fff',
    transition: 'opacity 0.15s ease',
    borderRadius: '50%',
  },
  fieldBlock: { marginBottom: '16px' },
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
    boxSizing: 'border-box',
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
    fontSize: '15px',
  },
  memberNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flexWrap: 'wrap',
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
  youPill: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--primary)',
    background: 'var(--primary-light)',
    borderRadius: '999px',
    padding: '3px 8px',
    flexShrink: 0,
  },
  pendingPill: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--text-secondary)',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '999px',
    padding: '3px 8px',
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
    padding: '3px 8px',
    flexShrink: 0,
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
  iconActionDanger: { color: 'var(--danger, #ef4444)' },
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
    fontSize: '15px',
  },
  resultRight: { flexShrink: 0 },
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