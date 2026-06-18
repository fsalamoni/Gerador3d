/**
 * Runtime mode for the LOCAL DESKTOP build.
 *
 * When the app is bundled into the desktop (Electron) application it is built
 * with `VITE_LOCAL=true`. In that mode there is no Firebase, no Auth and no
 * tunnel: the SPA is served by a local Python engine and talks to it over plain
 * REST at `/api/local`. The cloud build leaves `VITE_LOCAL` unset, so every
 * `IS_LOCAL` branch is dead code there and behaviour is unchanged.
 */
export const IS_LOCAL =
  String(import.meta.env.VITE_LOCAL ?? '').toLowerCase() === 'true'

/** Base path of the local engine's REST API (same origin as the served SPA). */
export const LOCAL_API = '/api/local'
