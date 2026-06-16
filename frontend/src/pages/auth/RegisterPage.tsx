import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { authErrorKey } from '../../lib/auth-errors'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'

export default function RegisterPage() {
  const { t } = useTranslation()
  const { signUpEmail } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signUpEmail(email, password, displayName || undefined)
      navigate('/onboarding')
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      footer={
        <>
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
            {t('auth.loginLink')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-300">
            {t('auth.displayName')}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('auth.email')}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">{t('auth.password')}</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
            autoComplete="new-password"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('auth.registerButton')}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-white/10" />
        {t('auth.or')}
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <GoogleButton onDone={() => navigate('/onboarding')} />
    </AuthShell>
  )
}
