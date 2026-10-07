import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string
  hint?: ReactNode
  tone?: 'good' | 'bad'
  icon?: ReactNode
  hero?: boolean
}

export function StatTile({ label, value, hint, tone, icon, hero }: Props) {
  return (
    <div className={`card stat${hero ? ' hero' : ''}`}>
      <div className="label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="value">{value}</div>
      {hint && <div className={`hint${tone ? ` ${tone}` : ''}`}>{hint}</div>}
    </div>
  )
}
