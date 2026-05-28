import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, reload } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { goOnline } from '../lib/presence'
import { initNotifications } from '../services/notificationService'
import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  sanitizeNotifications,
  sanitizePrivacy,
} from '../services/settingsService'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function withDefaults(firebaseUser, firestoreData = {}) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    ...firestoreData,
    privacy: sanitizePrivacy({ ...DEFAULT_PRIVACY, ...(firestoreData.privacy || {}) }),
    notifications: sanitizeNotifications({
      ...DEFAULT_NOTIFICATIONS,
      ...(firestoreData.notifications || {}),
    }),
    emailVerified: firebaseUser.emailVerified,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const stopPresenceRef = useRef(() => {})
  const stopNotifRef = useRef(() => {})

  async function buildUser(firebaseUser) {
    try {
      try {
        await reload(firebaseUser)
      } catch (_) {}

      const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
      const firestoreData = snap.exists() ? snap.data() : {}
      return withDefaults(firebaseUser, firestoreData)
    } catch (err) {
      console.warn('AuthContext buildUser error:', err)
      return withDefaults(firebaseUser, {})
    }
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        try {
          stopPresenceRef.current?.()
          stopPresenceRef.current = () => {}
          stopNotifRef.current?.()
          stopNotifRef.current = () => {}

          if (firebaseUser) {
            const userData = await buildUser(firebaseUser)
            setUser(userData)
            setError(null)

            // Only go online in RTDB if the user hasn't disabled their online status
            const showOnlineStatus = userData?.privacy?.showOnlineStatus !== false
            const stopPresence = goOnline(firebaseUser.uid, showOnlineStatus)
            if (typeof stopPresence === 'function') {
              stopPresenceRef.current = stopPresence
            }

            const wantsNotifications =
              userData?.notifications?.messages ||
              userData?.notifications?.mentions ||
              userData?.notifications?.friendReqs ||
              userData?.notifications?.appUpdates

            if (wantsNotifications) {
              const stopNotif = initNotifications(firebaseUser.uid)
              if (typeof stopNotif === 'function') {
                stopNotifRef.current = stopNotif
              }
            }
          } else {
            setUser(null)
            setError(null)
          }

          setLoading(false)
        } catch (err) {
          console.error('AuthContext onAuthStateChanged error:', err)
          setError(err.message)
          setLoading(false)
        }
      },
      (err) => {
        console.error('Auth state listener error:', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => {
      unsubAuth()
      stopPresenceRef.current?.()
      stopNotifRef.current?.()
    }
  }, [])

  async function refreshUser() {
    try {
      const firebaseUser = auth.currentUser
      if (!firebaseUser) return
      const userData = await buildUser(firebaseUser)
      setUser(userData)
      setError(null)
    } catch (err) {
      console.error('RefreshUser error:', err)
      setError(err.message)
    }
  }

  return (
    <AuthContext.Provider value={{ user, setUser, refreshUser, loading, error }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}