/**
 * Runtime mode for the LOCAL DESKTOP build.
 *
 * `IS_LOCAL` is true when EITHER the bundle was built with `VITE_LOCAL=true`
 * (the desktop frontend build) OR we are running inside the Electron desktop
 * shell (the preload exposes `window.gerador3d.desktop`). The runtime check
 * makes the desktop app robust even if the build-time flag is missing — it will
 * always run in local mode (no Firebase, no Auth, no landing page) inside the app.
 *
 * The cloud build leaves both signals off, so every `IS_LOCAL` branch is dead
 * code there and behaviour is unchanged.
 */
function readDesktopGlobal(): boolean {
  try {
    return Boolean((globalThis as unknown as { gerador3d?: { desktop?: boolean } })
      .gerador3d?.desktop)
  } catch {
    return false
  }
}

const builtLocal =
  String(import.meta.env.VITE_LOCAL ?? '').toLowerCase() === 'true'

/** True when running inside the Electron desktop shell. */
export const IS_DESKTOP = readDesktopGlobal()

/** True when the app should talk to the local engine instead of Firebase. */
export const IS_LOCAL = builtLocal || IS_DESKTOP

/** Base path of the local engine's REST API (same origin as the served SPA). */
export const LOCAL_API = '/api/local'
