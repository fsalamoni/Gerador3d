/**
 * Low-level persistence for user settings.
 *
 * Firebase mode  → Firestore document `/users/{uid}/settings/preferences`.
 * Demo mode      → localStorage keyed by uid.
 *
 * Everything funnels through `getSettings` / `saveSettings` so higher-level
 * stores (api keys, provider settings, catalog, task models) share one source
 * of truth — mirroring Lexio's settings/preferences design.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { IS_FIREBASE, auth, db } from './firebase'
import { IS_LOCAL } from './runtime'
import type { UserSettingsData } from './firestore-types'

const DEMO_SETTINGS_PREFIX = 'gerador3d_settings_'

/** Returns the current authenticated user id, or a demo fallback. */
export function getCurrentUserId(): string | undefined {
  if (IS_LOCAL) return 'local'
  if (IS_FIREBASE && auth) return auth.currentUser?.uid
  try {
    const raw = localStorage.getItem('gerador3d_demo_user')
    if (raw) return (JSON.parse(raw) as { uid?: string }).uid
  } catch {
    // ignore
  }
  return undefined
}

function resolveUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId()
}

function demoKey(uid: string): string {
  return `${DEMO_SETTINGS_PREFIX}${uid}`
}

/** Load the full settings document for a user (merged defaults applied by callers). */
export async function getSettings(uid?: string): Promise<UserSettingsData> {
  const resolved = resolveUid(uid)
  if (!resolved) return {}

  if (IS_FIREBASE && db) {
    const ref = doc(db, 'users', resolved, 'settings', 'preferences')
    const snap = await getDoc(ref)
    return snap.exists() ? (snap.data() as UserSettingsData) : {}
  }

  try {
    const raw = localStorage.getItem(demoKey(resolved))
    return raw ? (JSON.parse(raw) as UserSettingsData) : {}
  } catch {
    return {}
  }
}

/** Merge a partial patch into the user's settings document. */
export async function saveSettings(
  patch: Partial<UserSettingsData>,
  uid?: string,
): Promise<void> {
  const resolved = resolveUid(uid)
  if (!resolved) return

  if (IS_FIREBASE && db) {
    const ref = doc(db, 'users', resolved, 'settings', 'preferences')
    await setDoc(ref, patch, { merge: true })
    return
  }

  try {
    const current = await getSettings(resolved)
    const next = { ...current, ...patch }
    localStorage.setItem(demoKey(resolved), JSON.stringify(next))
  } catch {
    // ignore storage failures in demo mode
  }
}
