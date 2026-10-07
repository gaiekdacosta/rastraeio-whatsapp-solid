import { fmtInt } from '../lib/format'

interface PayloadItem {
  name?: unknown
  value?: unknown
  color?: string
  dataKey?: unknown
  payload?: Record<string, unknown>
}

interface Props {
  active?: boolean
  payload?: PayloadItem[]
  label?: unknown
  mark?: 'line' | 'rect'
  titleFormatter?: (label: unknown, row?: Record<string, unknown>) => string
  valueFormatter?: (v: number, key: string, row?: Record<string, unknown>) => string
}

export function ChartTooltip({ active, payload, label, mark = 'line', titleFormatter, valueFormatter }: Props) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  const title = titleFormatter ? titleFormatter(label, row) : label == null ? '' : String(label)
  return (
    <div className="tooltip" role="status">
      {title && <div className="tt-title">{title}</div>}
      {payload.map((p, i) => (
        <div className="tt-row" key={`${String(p.dataKey)}-${i}`}>
          <span className="k">
            <i className={mark === 'line' ? 'line-key' : 'legend-key rect'} style={{ background: p.color }} />
            {String(p.name ?? '')}
          </span>
          <span className="v">
            {valueFormatter ? valueFormatter(Number(p.value), String(p.dataKey), row) : fmtInt(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items, mark = 'line' }: { items: { label: string; color: string }[]; mark?: 'line' | 'rect' }) {
  return (
    <div className="legend" role="list">
      {items.map((it) => (
        <span className="legend-item" role="listitem" key={it.label}>
          <i className={`legend-key${mark === 'rect' ? ' rect' : ''}`} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
