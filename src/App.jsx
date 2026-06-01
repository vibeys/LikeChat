import React, { useEffect, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { Outlet, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { onForegroundMessage } from './services/notificationService'
import {
  At, Bell, HeartStraight, ChatCircle, Megaphone,
  Phone, PhoneX, UserCheck, UserPlus, Users, VideoCamera,
} from '@phosphor-icons/react'

function FcmToast({ children, onClick, duration = 10000 }) {
  const [progress, setProgress] = React.useState(100)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    const start = Date.now()
    let raf
    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  const barColor =
    progress > 40 ? 'var(--primary)' :
    progress > 15 ? '#f59e0b' :
                    '#ef4444'

  return (
    <motion.div
      onClick={onClick}
      initial={{ y: -20, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -10, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '14px 16px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: 'var(--text-primary)',
        fontSize: '14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        maxWidth: '360px',
        width: '100%',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingBottom: '10px' }}>
        {children}
      </div>
      <div style={{ height: '3px', background: 'var(--border)', marginLeft: '-16px', marginRight: '-16px' }}>
        <motion.div
          style={{
            height: '100%',
            background: barColor,
          }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  )
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      try {
        const title = payload?.notification?.title || payload?.data?.title || 'New notification'
        const body  = payload?.notification?.body  || payload?.data?.body  || ''
        const type  = payload?.data?.type || ''
        const data  = payload?.data || {}
        const isVideo = data.callType === 'video'
        const toastDuration = type === 'call' ? 30000 : 10000

                const getIcon = () => {
          switch (type) {
            case 'message':         return <ChatCircle   size={18} weight="fill" style={{ color: '#60a5fa' }} />
            case 'media':           return <ChatCircle   size={18} weight="fill" style={{ color: '#60a5fa' }} />
            case 'reaction':        return <HeartStraight size={18} weight="fill" style={{ color: '#f472b6' }} />
            case 'mention':         return <At           size={18} weight="fill" style={{ color: '#a78bfa' }} />
            case 'announce':        return <Megaphone     size={18} weight="fill" style={{ color: '#fb923c' }} />
            case 'friend_request':  return <UserPlus      size={18} weight="fill" style={{ color: '#34d399' }} />
            case 'friend_accepted': return <UserCheck     size={18} weight="fill" style={{ color: '#34d399' }} />
            case 'group_invite':    return <Users         size={18} weight="fill" style={{ color: '#a78bfa' }} />
            case 'call':            return isVideo
              ? <VideoCamera size={18} weight="fill" style={{ color: '#60a5fa' }} />
              : <Phone       size={18} weight="fill" style={{ color: '#60a5fa' }} />
            case 'missed_call':     return <PhoneX       size={18} weight="fill" style={{ color: '#ef4444' }} />
            default:                return <Bell         size={18} weight="fill" style={{ color: '#60a5fa' }} />
          }
        }

        const handleClick = () => {
          toast.dismiss()
          if (['friend_request', 'friend_accepted'].includes(type)) {
            navigate('/app/friends')
          } else if (data.convId) {
            navigate(`/app/chats/${data.convId}`)
          } else {
            navigate('/app/notifications')
          }
        }

        toast.custom((t) => (
          <FcmToast onClick={handleClick} duration={toastDuration}>
            {getIcon()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                {title}
              </p>
              {body ? (
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {body}
                </p>
              ) : null}
            </div>
          </FcmToast>
        ), {
          duration: toastDuration,
          position: 'top-center',
        })
      } catch (error) {
        console.error('Error handling foreground message:', error)
      }
    })

    return () => unsubscribe?.()
  }, [navigate])

  return (
    <>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      <Outlet />
    </>
  )
}