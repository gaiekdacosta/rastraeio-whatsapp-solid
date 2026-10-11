import { useState } from 'react'
import { Check, CircleHelp, Pencil, Phone, RotateCcw, Users } from 'lucide-react'
import { LINE_NONE } from '../lib/analytics'
import { fmtLine } from '../lib/format'
import { useLineNames } from '../lineNames'
import { ChoiceFilter } from './ChoiceFilter'
import type { ChoiceOption } from './ChoiceFilter'

interface Props {
  lines: string[]
  hasUnknownLine: boolean
  counts: Map<string, number> // conversas de leads por número ('' = não identificado)
  attendants: Map<string, string[]>
  value: string // 'all' | LINE_NONE | número
  onChange: (line: string) => void
}

const EXAMPLES = ['Loja Centro', 'Vendas', 'Suporte', 'Atacado']

/** Filtro por número da empresa, com o formulário para dar nome a cada número (salvo no navegador). */
export function LineFilter({ lines, hasUnknownLine, counts, attendants, value, onChange }: Props) {
  const { names, label, isRenamed, rename, resetNames } = useLineNames()
  const [editing, setEditing] = useState(false)

  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const options: ChoiceOption[] = [
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

  return (
    <ChoiceFilter
      label="Número da empresa"
      icon={Phone}
      options={options}
      value={value}
      onChange={onChange}
      actions={
        <button type="button" className="btn ghost sm" aria-pressed={editing} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          <Pencil size={13} aria-hidden /> Renomear
        </button>
      }
    >
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
    </ChoiceFilter>
  )
}
