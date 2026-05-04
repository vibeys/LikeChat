import { Toaster } from 'react-hot-toast'
import { Outlet } from 'react-router'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { onForegroundMessage } from './services/notificationService'
import { MessageCircle, UserPlus, Users, Bell } from 'lucide-react'

export default function App() {
  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      try {
        // FCM foreground messages may carry data in payload.notification OR payload.data
        const title = payload?.notification?.title || payload?.data?.title || 'New notification'
        const body  = payload?.notification?.body  || payload?.data?.body  || ''
        const type  = payload?.data?.type || ''

        const getIcon = () => {
          switch (type) {
            case 'message':        return <MessageCircle size={18} style={{ color: '#60a5fa' }} />
            case 'media':          return <MessageCircle size={18} style={{ color: '#60a5fa' }} />
            case 'friend_request': return <UserPlus size={18} style={{ color: '#34d399' }} />
            case 'group_invite':   return <Users size={18} style={{ color: '#a78bfa' }} />
            default:               return <Bell size={18} style={{ color: '#60a5fa' }} />
          }
        }

        toast.custom((t) => (
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            color: 'var(--text-primary)',
            fontSize: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            animation: t.visible ? 'slideInDown 0.3s ease-out' : 'slideOutUp 0.3s ease-in',
            maxWidth: '360px',
            width: '100%',
          }}>
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
          </div>
        ), {
          duration: 5000,
          position: 'top-center',
        })
      } catch (error) {
        console.error('Error handling foreground message:', error)
      }
    })

    return () => unsubscribe?.()
  }, [])

  return (
    <>
      <Toaster position="top-center" />
      <Outlet />
    </>
  )
}