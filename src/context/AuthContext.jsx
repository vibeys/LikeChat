import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { goOnline } from '../lib/presence'

const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  async function buildUser(firebaseUser) {
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
      const firestoreData = snap.exists() ? snap.data() : {}
      return {
        uid:           firebaseUser.uid,
        email:         firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        displayName:   firebaseUser.displayName,
        ...firestoreData,
      }
    } catch {
      // Firestore unreadable (rules not published yet, etc.) — still let user in
      return {
        uid:           firebaseUser.uid,
        email:         firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        displayName:   firebaseUser.displayName,
      }
    }
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await buildUser(firebaseUser)
        setUser(userData)
        goOnline(firebaseUser.uid)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
  }, [])

  async function refreshUser() {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) return
    const userData = await buildUser(firebaseUser)
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, refreshUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}