import type { Palette } from '../../theme'
import type { FunnelStep } from '../../lib/analytics'
import { fmtInt, fmtPct } from '../../lib/format'

export function FunnelBars({ steps, palette }: { steps: FunnelStep[]; palette: Palette }) {
  const top = Math.max(1, steps[0]?.count ?? 1)
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : s.count
        const stepRate = prev ? s.count / prev : NaN
        return (
          <div className="funnel-row" key={s.id} title={s.hint}>
            <div className="funnel-label">
              <b>{s.label}</b>
              <span>{s.hint}</span>
            </div>
            <div className="funnel-track" aria-hidden>
              <div
                className="funnel-bar"
                style={{ width: `${Math.max(1, (s.count / top) * 100)}%`, background: palette.ordinal[Math.min(i, palette.ordinal.length - 1)] }}
              />
            </div>
            <div className="funnel-vals">
              <b>{fmtInt(s.count)}</b>
              <span>{i === 0 ? '100%' : `${fmtPct(s.count / top)} do topo · ${fmtPct(stepRate)} da etapa anterior`}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
