/**
 * Shared visual shell for the auth pages (login / register / reset).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Box } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import LanguageSwitcher from '../../components/LanguageSwitcher'

export default function AuthShell({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const { isDemo } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Box className="h-7 w-7 text-brand-400" />
          <span className="text-xl font-semibold tracking-tight">{t('app.name')}</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-xl">
          <h1 className="mb-6 text-center text-xl font-semibold text-white">{title}</h1>

          {isDemo && (
            <div className="mb-5 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-300">
              {t('auth.demoNotice')}
            </div>
          )}

          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  )
}
