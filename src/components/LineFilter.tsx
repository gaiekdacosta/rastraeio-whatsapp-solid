import { useState } from 'react'
import { Check, CircleHelp, LayoutGrid, Pencil, Phone, RotateCcw, Rows3, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LINE_NONE } from '../lib/analytics'
import { fmtInt, fmtLine, fmtPct } from '../lib/format'
import { loadLineFilterStyle, saveLineFilterStyle } from '../lib/storage'
import type { LineFilterStyle } from '../lib/storage'
import { useLineNames } from '../lineNames'

interface Props {
  lines: string[]
  hasUnknownLine: boolean
  counts: Map<string, number> // conversas de leads por número ('' = não identificado)
  attendants: Map<string, string[]>
  value: string // 'all' | LINE_NONE | número
  onChange: (line: string) => void
}

interface Option {
  value: string
  title: string
  sub: string
  hint: string
  count: number
  icon: LucideIcon
}

const EXAMPLES = ['Loja Centro', 'Vendas', 'Suporte', 'Atacado']

export function LineFilter({ lines, hasUnknownLine, counts, attendants, value, onChange }: Props) {
  const { names, label, isRenamed, rename, resetNames } = useLineNames()
  const [style, setStyle] = useState<LineFilterStyle>(() => loadLineFilterStyle())
  const [editing, setEditing] = useState(false)

  const changeStyle = (s: LineFilterStyle) => {
    setStyle(s)
    saveLineFilterStyle(s)
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const options: Option[] = [
    {
      value: 'all',
      title: 'Todos os números',
      sub: `${lines.length} números${hasUnknownLine ? ' e não identificados' : ''}`,
      hint: 'Mostrar todos os números',
      count: total,
      icon: Users,
    },
    ...lines.map((l) => {
      const who = (attendants.get(l) ?? []).join(', ')
      return {
        value: l,
        title: label(l),
        sub: isRenamed(l) ? fmtLine(l) : who || 'Sem atendente identificado',
        hint: isRenamed(l) ? `${fmtLine(l)}${who ? ` · ${who}` : ''}` : who,
        count: counts.get(l) ?? 0,
        icon: Phone,
      }
    }),
    ...(hasUnknownLine
      ? [
          {
            value: LINE_NONE,
            title: 'Não identificado',
            sub: 'Leads que nunca receberam resposta',
            hint: 'A planilha não diz para qual número escreveram os leads que nunca receberam resposta',
            count: counts.get('') ?? 0,
            icon: CircleHelp,
          },
        ]
      : []),
  ]
  // Clicar no número já selecionado volta para "todos".
  const pick = (v: string) => onChange(v !== 'all' && v === value ? 'all' : v)

  return (
    <div className="line-filter">
      <div className="line-filter-head">
        <span className="line-filter-label">
          <Phone size={14} aria-hidden /> Número da empresa
        </span>
        {style === 'compact' && (
          <div className="segmented" role="group" aria-label="Número da empresa">
            {options.map((o) => (
              <button key={o.value} type="button" aria-pressed={value === o.value} title={o.hint} onClick={() => pick(o.value)}>
                {o.value === 'all' ? 'Todos' : o.title}
                {o.value !== 'all' && <span className="count">{fmtInt(o.count)}</span>}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost sm" aria-pressed={editing} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          <Pencil size={13} aria-hidden /> Renomear
        </button>
        <div className="segmented sm" role="group" aria-label="Visual do filtro de número">
          <button type="button" aria-pressed={style === 'cards'} title="Cartões" aria-label="Visual em cartões" onClick={() => changeStyle('cards')}>
            <LayoutGrid size={13} aria-hidden />
          </button>
          <button type="button" aria-pressed={style === 'compact'} title="Compacto" aria-label="Visual compacto" onClick={() => changeStyle('compact')}>
            <Rows3 size={13} aria-hidden />
          </button>
        </div>
      </div>

      {style === 'cards' && (
        <div className="line-cards" role="group" aria-label="Número da empresa">
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

      {editing && (
        <div
          className="line-rename"
          role="group"
          aria-label="Renomear números"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setEditing(false)
          }}
        >
          {lines.map((l, i) => {
            const who = (attendants.get(l) ?? []).join(', ')
            return (
              <div className="line-rename-row" key={l}>
                <label htmlFor={`line-name-${l}`}>
                  <Phone size={13} aria-hidden /> {fmtLine(l)}
                </label>
                <input
                  id={`line-name-${l}`}
                  type="text"
                  value={names[l] ?? ''}
                  placeholder={`Ex.: ${EXAMPLES[i % EXAMPLES.length]}`}
                  maxLength={40}
                  autoFocus={i === 0}
                  onChange={(e) => rename(l, e.target.value)}
                />
                <span className="small muted line-rename-who" title={who}>
                  {who || 'Sem atendente identificado'}
                </span>
              </div>
            )
          })}
          <div className="line-rename-foot">
            <span className="small muted">O nome aparece em todo o dashboard e fica salvo neste navegador. Em branco, volta a mostrar o número.</span>
            <span className="line-rename-actions">
              <button type="button" className="btn ghost sm" disabled={!lines.some((l) => isRenamed(l))} onClick={resetNames}>
                <RotateCcw size={13} aria-hidden /> Restaurar números
              </button>
              <button type="button" className="btn primary sm" onClick={() => setEditing(false)}>
                <Check size={13} aria-hidden /> Concluir
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
