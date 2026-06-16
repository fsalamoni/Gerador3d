/**
 * Small, dependency-free analytics primitives (no chart library needed):
 *  - StatCard: a single headline metric.
 *  - BarList: horizontal bars for a labelled count map.
 *  - Sparkline: a compact SVG area chart for a daily timeline.
 */
import type { LucideIcon } from 'lucide-react'
import type { DailyCount } from '../../lib/analytics'

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function BarList({
  entries,
  labelFor,
  emptyLabel,
}: {
  entries: Array<[string, number]>
  labelFor?: (key: string) => string
  emptyLabel: string
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyLabel}</p>
  }
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="space-y-2.5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-300">{labelFor ? labelFor(key) : key}</span>
            <span className="font-medium text-slate-200">{value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Sparkline({
  data,
  height = 64,
}: {
  data: DailyCount[]
  height?: number
}) {
  const width = 320
  const max = Math.max(...data.map((d) => d.count), 1)
  const n = data.length
  if (n === 0) return null

  const stepX = width / Math.max(n - 1, 1)
  const points = data.map((d, i) => {
    const x = i * stepX
    const y = height - (d.count / max) * (height - 8) - 4
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label="timeline"
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark)" />
      <path d={linePath} fill="none" stroke="rgb(129,140,248)" strokeWidth="2" />
    </svg>
  )
}
