import { LayoutDashboard, Lightbulb } from 'lucide-react'
import { INSIGHTS_CATALOG } from '../lib/insights'
import { OVERVIEW_CATALOG } from '../lib/overview'
import type { PanelSelection } from '../lib/panel'
import { BlockPicker } from './BlockPicker'

/** Blocos da Visão geral e da aba Insights que uma pessoa vê. Vai dentro de um `fieldset.field`. */
export function PanelPicker({ value, onChange, disabled }: { value: PanelSelection; onChange: (next: PanelSelection) => void; disabled?: boolean }) {
  return (
    <div className="panel-picker">
      <section className="panel-section" aria-label="Visão geral">
        <div className="panel-section-head">
          <LayoutDashboard size={14} aria-hidden />
          <b>Visão geral</b>
          <span className="small muted">Sem nenhum bloco marcado, a aba fica vazia.</span>
        </div>
        <BlockPicker catalog={OVERVIEW_CATALOG} value={value.visaoGeral} onChange={(visaoGeral) => onChange({ ...value, visaoGeral })} disabled={disabled} />
      </section>
      <section className="panel-section" aria-label="Insights">
        <div className="panel-section-head">
          <Lightbulb size={14} aria-hidden />
          <b>Insights</b>
          <span className="small muted">Sem nenhum bloco marcado, a aba some do painel.</span>
        </div>
        <BlockPicker catalog={INSIGHTS_CATALOG} value={value.insights} onChange={(insights) => onChange({ ...value, insights })} disabled={disabled} />
      </section>
    </div>
  )
}
