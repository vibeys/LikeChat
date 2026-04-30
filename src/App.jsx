import { Toaster } from 'react-hot-toast'
import { Outlet } from 'react-router'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { onForegroundMessage } from './services/notificationService'
import { MessageCircle, UserPlus, Users, Bell } from 'lucide-react'

export default function App() {
  useEffect(() => {
    // Listen for foreground notifications
    const unsubscribe = onForegroundMessage((payload) => {
      const data = payload.notification
      const dataPayload = payload.data
      
      if (!data) return
      
      // Get notification type icon
      const getIcon = () => {
        switch (dataPayload?.type) {
          case 'message': return <MessageCircle size={18} className="text-blue-400" />
          case 'friend_request': return <UserPlus size={18} className="text-green-400" />
          case 'group_invite': return <Users size={18} className="text-purple-400" />
          default: return <Bell size={18} className="text-blue-400" />
        }
      }
      
      // Show toast notification
      toast.custom((t) => (
        <div style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          color: 'var(--text-1)',
          fontSize: '14px',
          boxShadow: 'var(--shadow-lg)',
          animation: t.visible ? 'slideInDown 0.3s ease-out' : 'slideOutUp 0.3s ease-in',
        }}>
          {getIcon()}
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 2px', fontWeight: '600', fontSize: '14px' }}>{data.title}</p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.body}</p>
          </div>
        </div>
      ), {
        duration: 5000,
        position: 'top-center',
      })
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