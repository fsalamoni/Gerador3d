/**
 * Authentication context — wraps Firebase Auth and exposes a small, typed API.
 *
 * In demo mode (no Firebase config) it simulates a signed-in user kept in
 * localStorage, so the whole UI can be explored without a backend.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { ADMIN_EMAIL, IS_FIREBASE, auth } from '../lib/firebase'
import { IS_LOCAL } from '../lib/runtime'
import type { UserRole } from '../lib/firestore-types'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  isDemo: boolean
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (email: string, password: string, displayName?: string) => Promise<void>
  signInGoogle: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_USER_KEY = 'gerador3d_demo_user'

function toAuthUser(user: User): AuthUser {
  const email = user.email
  const role: UserRole =
    ADMIN_EMAIL && email && email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user'
  return { uid: user.uid, email, displayName: user.displayName, role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (IS_LOCAL) {
      // Desktop app: no login needed — the app is the user's own machine.
      setUser({
        uid: 'local',
        email: 'local@gerador3d.app',
        displayName: 'Você',
        role: ADMIN_EMAIL ? 'admin' : 'user',
      })
      setLoading(false)
      return undefined
    }

    if (IS_FIREBASE && auth) {
      const unsub = onAuthStateChanged(auth, (fbUser) => {
        setUser(fbUser ? toAuthUser(fbUser) : null)
        setLoading(false)
      })
      return unsub
    }

    // Demo mode — restore any simulated session.
    try {
      const raw = localStorage.getItem(DEMO_USER_KEY)
      if (raw) setUser(JSON.parse(raw) as AuthUser)
    } catch {
      // ignore malformed demo state
    }
    setLoading(false)
    return undefined
  }, [])

  function persistDemoUser(next: AuthUser | null) {
    setUser(next)
    try {
      if (next) localStorage.setItem(DEMO_USER_KEY, JSON.stringify(next))
      else localStorage.removeItem(DEMO_USER_KEY)
    } catch {
      // ignore storage failures in demo mode
    }
  }

  function makeDemoUser(email: string, displayName?: string): AuthUser {
    const role: UserRole =
      ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user'
    return {
      uid: `demo-${btoa(email).replace(/=/g, '').slice(0, 16)}`,
      email,
      displayName: displayName ?? email.split('@')[0],
      role,
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isDemo: !IS_FIREBASE,
      async signInEmail(email, password) {
        if (IS_FIREBASE && auth) {
          await signInWithEmailAndPassword(auth, email, password)
          return
        }
        persistDemoUser(makeDemoUser(email))
      },
      async signUpEmail(email, password, displayName) {
        if (IS_FIREBASE && auth) {
          const cred = await createUserWithEmailAndPassword(auth, email, password)
          if (displayName) await updateProfile(cred.user, { displayName })
          setUser(toAuthUser({ ...cred.user, displayName: displayName ?? null } as User))
          return
        }
        persistDemoUser(makeDemoUser(email, displayName))
      },
      async signInGoogle() {
        if (IS_FIREBASE && auth) {
          await signInWithPopup(auth, new GoogleAuthProvider())
          return
        }
        persistDemoUser(makeDemoUser('demo.user@gerador3d.app', 'Demo User'))
      },
      async resetPassword(email) {
        if (IS_FIREBASE && auth) {
          await sendPasswordResetEmail(auth, email)
        }
        // demo mode: no-op (UI shows the success message regardless)
      },
      async logout() {
        if (IS_FIREBASE && auth) {
          await signOut(auth)
          return
        }
        persistDemoUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
