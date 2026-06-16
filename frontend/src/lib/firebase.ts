/**
 * Firebase initialization and runtime-mode detection.
 *
 * The platform can run in two modes:
 *  - Firebase mode: real Auth + Firestore + Storage, used when the VITE_FIREBASE_*
 *    environment variables are present.
 *  - Demo mode: no backend, everything is kept in memory / localStorage. This lets
 *    the UI be explored before the user wires up their own Firebase project.
 *
 * Inspired by the multi-mode approach used in the Lexio platform.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { getFunctions, type Functions } from 'firebase/functions'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const demoForced = String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true'
const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

/** True when the app talks to a real Firebase project. */
export const IS_FIREBASE = hasFirebaseConfig && !demoForced

/** True when the app runs fully client-side with no backend. */
export const IS_DEMO = !IS_FIREBASE

let app: FirebaseApp | undefined
let authInstance: Auth | undefined
let dbInstance: Firestore | undefined
let storageInstance: FirebaseStorage | undefined
let functionsInstance: Functions | undefined
let analyticsInstance: Analytics | undefined

/** Region where the Cloud Functions are deployed. */
export const FUNCTIONS_REGION =
  (import.meta.env.VITE_FUNCTIONS_REGION ?? 'us-central1').trim() || 'us-central1'

if (IS_FIREBASE) {
  app = initializeApp(firebaseConfig)
  authInstance = getAuth(app)
  dbInstance = getFirestore(app)
  storageInstance = getStorage(app)
  functionsInstance = getFunctions(app, FUNCTIONS_REGION)

  // Google Analytics for Firebase (optional, guarded by support + measurementId).
  if (firebaseConfig.measurementId) {
    void isSupported()
      .then((ok) => {
        if (ok && app) analyticsInstance = getAnalytics(app)
      })
      .catch(() => {
        // Analytics is non-critical; ignore failures (e.g. blocked by browser).
      })
  }
}

export const firebaseApp = app
export const auth = authInstance
export const db = dbInstance
export const storage = storageInstance
export const functions = functionsInstance

/** Returns the Analytics instance once initialized, or undefined. */
export function getAnalyticsInstance(): Analytics | undefined {
  return analyticsInstance
}

/** Email that is treated as the platform administrator, if configured. */
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? '').trim().toLowerCase()
