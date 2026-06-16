/**
 * Authenticated app shell — sidebar navigation + top bar + routed content.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Box,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  Video,
  Library,
  BarChart3,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from './LanguageSwitcher'

const NAV_ITEMS = [
  { to: '/app', icon: LayoutDashboard, key: 'nav.dashboard', end: true },
  { to: '/app/generate', icon: Sparkles, key: 'nav.generate', end: false },
  { to: '/app/library', icon: Library, key: 'nav.library', end: false },
  { to: '/app/studio', icon: Video, key: 'nav.studio', end: false },
  { to: '/app/analytics', icon: BarChart3, key: 'nav.analytics', end: false },
  { to: '/app/settings', icon: Settings, key: 'nav.settings', end: false },
] as const

export default function AppLayout() {
  const { t } = useTranslation()
  const { user, logout, isDemo } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-white/10 bg-slate-900/60">
        <div className="flex items-center gap-2 px-5 py-5">
          <Box className="h-6 w-6 text-brand-400" />
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-200'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {t(item.key)}
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-200'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <ShieldCheck className="h-4 w-4" />
              {t('nav.admin')}
            </NavLink>
          )}
        </nav>

        <div className="border-t border-white/10 p-3">
          {isDemo && (
            <div className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              {t('auth.demoNotice')}
            </div>
          )}
          <div className="mb-2 px-2 text-xs text-slate-400">
            {user?.displayName ?? user?.email}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-3 border-b border-white/10 px-6 py-3">
          <LanguageSwitcher />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
