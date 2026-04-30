import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

// ── REGISTER ─────────────────────────────────────────────
// Creates Firebase Auth user + Firestore doc + sends verification email.
export async function register({ displayName, email, password }) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)

  // Set displayName on the Auth profile
  await firebaseUpdateProfile(user, { displayName: displayName.trim() })

  // ✅ FIX: Create Firestore user doc immediately after auth user is created.
  // Without this, all subsequent Firestore reads/writes fail with
  // "Missing or insufficient permissions" because the doc doesn't exist yet.
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: displayName.trim(),
    email: email.trim(),
    photoURL: '',
    username: '',
    bio: '',
    emailVerified: false,
    phoneVerified: false,
    phone: '',
    setupComplete: false,
    status: 'offline',
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp(),
    pinnedConvs: [],
    mutedConvs: [],
    blockedUsers: [],
  })

  // Send verification email (non-blocking)
  try { await sendEmailVerification(user) } catch (_) {}

  return user
}

// ── LOGIN ─────────────────────────────────────────────────
export async function login({ email, password }) {
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  return user
}

// ── GOOGLE ────────────────────────────────────────────────
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider()
  const { user } = await signInWithPopup(auth, provider)

  const snap = await getDoc(doc(db, 'users', user.uid))
  if (!snap.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      username: '',
      bio: '',
      emailVerified: true,
      phoneVerified: false,
      phone: '',
      setupComplete: false,
      status: 'offline',
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
      pinnedConvs: [],
      mutedConvs: [],
      blockedUsers: [],
    })
  }
  return user
}

// ── LOGOUT ────────────────────────────────────────────────
export async function logout() {
  await signOut(auth)
}

// ── PASSWORD RESET ────────────────────────────────────────
export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email)
}

// ── PHONE OTP ─────────────────────────────────────────────
export async function sendPhoneOTP(phoneNumber) {
  const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {},
  })
  const result = await linkWithPhoneNumber(auth.currentUser, phoneNumber, verifier)
  sessionStorage.setItem('otp_verificationId', result.verificationId)
  return result
}

export async function verifyPhoneOTP(code) {
  const verificationId = sessionStorage.getItem('otp_verificationId')
  if (!verificationId) throw new Error('Session expired. Please re-send OTP.')
  const credential = PhoneAuthProvider.credential(verificationId, code)
  await linkWithCredential(auth.currentUser, credential)
  sessionStorage.removeItem('otp_verificationId')
}