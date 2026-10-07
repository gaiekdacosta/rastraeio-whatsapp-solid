import { useState } from 'react'
import type { Palette } from '../../theme'
import { WEEKDAYS_LONG, WEEKDAYS_SHORT, fmtInt } from '../../lib/format'

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface Props {
  grid: number[][]
  palette: Palette
  unit?: string
}

export function HourHeatmap({ grid, palette, unit = 'mensagens recebidas' }: Props) {
  const [focus, setFocus] = useState<{ d: number; h: number } | null>(null)
  const flat = grid.flat()
  const max = Math.max(1, ...flat)
  const steps = palette.sequential
  const colorFor = (v: number): string | undefined => {
    if (v <= 0) return undefined
    const idx = Math.min(steps.length - 1, Math.max(0, Math.ceil(Math.sqrt(v / max) * steps.length) - 1))
    return steps[idx]
  }
  const total = flat.reduce((a, b) => a + b, 0)
  if (total === 0) return <div className="empty">Sem mensagens recebidas no período.</div>

  return (
    <div>
      <div className="heat" role="grid" aria-label={`Mapa de calor de ${unit} por dia da semana e hora`}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div className="collabel" key={`h${h}`} aria-hidden>
            {h % 3 === 0 ? `${h}h` : ''}
          </div>
        ))}
        {DAY_ORDER.map((d) => (
          <RowFragment key={d} d={d} grid={grid} colorFor={colorFor} setFocus={setFocus} />
        ))}
      </div>
      <div className="row-between" style={{ marginTop: 8 }}>
        <div className="small" style={{ color: 'var(--ink-2)', minHeight: 18 }} aria-live="polite">
          {focus
            ? `${WEEKDAYS_LONG[focus.d]}, ${String(focus.h).padStart(2, '0')}h–${String(focus.h + 1).padStart(2, '0')}h: ${fmtInt(
                grid[focus.d][focus.h],
              )} ${unit}`
            : 'Passe o mouse ou navegue pelas células para ver os valores.'}
        </div>
        <div className="scale" aria-hidden>
          <span>menos</span>
          <span className="ramp">
            {steps.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
          <span>mais</span>
        </div>
      </div>
    </div>
  )
}

function RowFragment({
  d,
  grid,
  colorFor,
  setFocus,
}: {
  d: number
  grid: number[][]
  colorFor: (v: number) => string | undefined
  setFocus: (f: { d: number; h: number } | null) => void
}) {
  return (
    <>
      <div className="rowlabel" role="rowheader">
        {WEEKDAYS_SHORT[d]}
      </div>
      {grid[d].map((v, h) => (
        <div
          key={`${d}-${h}`}
          role="gridcell"
          tabIndex={0}
          className="cell"
          style={{ background: colorFor(v) }}
          aria-label={`${WEEKDAYS_LONG[d]} ${h}h: ${v}`}
          onMouseEnter={() => setFocus({ d, h })}
          onMouseLeave={() => setFocus(null)}
          onFocus={() => setFocus({ d, h })}
          onBlur={() => setFocus(null)}
        />
      ))}
    </>
  )
}
