import { useState } from 'react'
import type { ReactNode } from 'react'
import { LayoutGrid, Rows3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fmtInt, fmtPct } from '../lib/format'
import { loadLineFilterStyle, saveLineFilterStyle } from '../lib/storage'
import type { LineFilterStyle } from '../lib/storage'

export interface ChoiceOption {
  value: string
  title: string
  sub: string
  hint: string
  count: number
  icon: LucideIcon
}

interface Props {
  /** Rótulo do grupo (ex.: "Clientes", "Número da empresa"). */
  label: string
  icon: LucideIcon
  /** A primeira opção é "todos" (value 'all'); a contagem dela é o total usado na participação das demais. */
  options: ChoiceOption[]
  value: string
  onChange: (value: string) => void
  /** Botões extras no cabeçalho (ex.: Renomear). */
  actions?: ReactNode
  /** Painel abaixo das opções (ex.: formulário de renomear). */
  children?: ReactNode
}

/**
 * Filtro de escolha única com dois visuais: cartões com contagem e participação, ou linha compacta de
 * botões. O visual fica salvo no navegador e é o mesmo para todos os filtros deste tipo.
 */
export function ChoiceFilter({ label, icon: LabelIcon, options, value, onChange, actions, children }: Props) {
  const [style, setStyle] = useState<LineFilterStyle>(() => loadLineFilterStyle())

  const changeStyle = (s: LineFilterStyle) => {
    setStyle(s)
    saveLineFilterStyle(s)
  }

  const total = options.find((o) => o.value === 'all')?.count ?? 0
  // Clicar na opção já selecionada volta para "todos".
  const pick = (v: string) => onChange(v !== 'all' && v === value ? 'all' : v)

  return (
    <div className="line-filter">
      <div className="line-filter-head">
        <span className="line-filter-label">
          <LabelIcon size={14} aria-hidden /> {label}
        </span>
        {style === 'compact' && (
          <div className="segmented" role="group" aria-label={label}>
            {options.map((o) => (
              <button key={o.value} type="button" aria-pressed={value === o.value} title={o.hint} onClick={() => pick(o.value)}>
                {o.value === 'all' ? 'Todos' : o.title}
                {o.value !== 'all' && <span className="count">{fmtInt(o.count)}</span>}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        {actions}
        <div className="segmented sm" role="group" aria-label={`Visual do filtro ${label}`}>
          <button type="button" aria-pressed={style === 'cards'} title="Cartões" aria-label="Visual em cartões" onClick={() => changeStyle('cards')}>
            <LayoutGrid size={13} aria-hidden />
          </button>
          <button type="button" aria-pressed={style === 'compact'} title="Compacto" aria-label="Visual compacto" onClick={() => changeStyle('compact')}>
            <Rows3 size={13} aria-hidden />
          </button>
        </div>
      </div>

      {style === 'cards' && (
        <div className="line-cards" role="group" aria-label={label}>
          {options.map((o) => {
            const Icon = o.icon
            const share = o.value === 'all' ? 1 : total ? o.count / total : 0
            return (
              <button key={o.value} type="button" className="line-card" aria-pressed={value === o.value} title={o.hint} onClick={() => pick(o.value)}>
                <span className="line-card-title">
                  <Icon size={14} aria-hidden />
                  <span>{o.title}</span>
                </span>
                <span className="line-card-sub">{o.sub}</span>
                <span className="line-card-foot">
                  <span>
                    <b>{fmtInt(o.count)}</b> conversas
                  </span>
                  {o.value !== 'all' && <span>{fmtPct(share)}</span>}
                </span>
                <span className="line-card-bar" aria-hidden>
                  <i style={{ width: `${share * 100}%` }} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {children}
    </div>
  )
}
