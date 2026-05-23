import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, reload } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { goOnline } from '../lib/presence'
import { initNotifications } from '../services/notificationService'

const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  async function buildUser(firebaseUser) {
    try {
      try { await reload(firebaseUser) } catch (_) {}
      const snap          = await getDoc(doc(db, 'users', firebaseUser.uid))
      const firestoreData = snap.exists() ? snap.data() : {}
      return {
        uid:          firebaseUser.uid,
        email:        firebaseUser.email,
        displayName:  firebaseUser.displayName,
        ...firestoreData,
        // always override with live value from Firebase Auth
        emailVerified: firebaseUser.emailVerified,
      }
    } catch (err) {
      console.warn('AuthContext buildUser error:', err)
      return {
        uid:           firebaseUser.uid,
        email:         firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        displayName:   firebaseUser.displayName,
      }
    }
  }

  useEffect(() => {
    let unsubNotif = () => {}
    const unsubAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        try {
          unsubNotif()
          if (firebaseUser) {
            const userData = await buildUser(firebaseUser)
            setUser(userData)
            setError(null)
            goOnline(firebaseUser.uid)
            unsubNotif = initNotifications(firebaseUser.uid) ?? (() => {})
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
    return () => { unsubAuth(); unsubNotif() }
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