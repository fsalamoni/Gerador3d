/**
 * Reusable placeholder for pages that land in later phases.
 */
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function PagePlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/15">
        <Icon className="h-8 w-8 text-brand-400" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-white">{title}</h1>
      {description && <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>}
      <span className="mt-6 rounded-full bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300">
        {t('common.comingSoon')}
      </span>
    </div>
  )
}
