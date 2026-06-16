import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { authErrorKey } from '../../lib/auth-errors'
import AuthShell from './AuthShell'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      footer={
        <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-3 text-center text-sm text-emerald-300">
          {t('auth.resetSent')}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
          >
            {busy ? t('common.loading') : t('auth.resetButton')}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
