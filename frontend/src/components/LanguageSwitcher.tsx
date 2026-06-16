/**
 * Language switcher — toggles between PT-BR and EN and persists the choice.
 */
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage === 'en' ? 'en' : 'pt'

  function toggle() {
    void i18n.changeLanguage(current === 'pt' ? 'en' : 'pt')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 ${className}`}
      aria-label="Toggle language"
    >
      <Languages className="h-3.5 w-3.5" />
      {current === 'pt' ? 'PT' : 'EN'}
    </button>
  )
}
