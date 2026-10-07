import { CalendarRange, Filter, RotateCcw } from 'lucide-react'
import type { Filters, RangePreset } from '../lib/types'
import { fmtDateKey, fmtDateTime } from '../lib/format'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { LineFilter } from './LineFilter'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  procedures: string[]
  channels: string[]
  lines: string[]
  hasUnknownLine: boolean
  lineCounts: Map<string, number> // conversas de leads por número ('' = não identificado), com os demais filtros aplicados
  attendants: Map<string, string[]>
  refTime: Date
  range: { from: string; to: string }
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Mês atual' },
  { id: 'custom', label: 'Personalizado' },
]

export const DEFAULT_FILTERS: Filters = { preset: 'all', from: '', to: '', procedure: 'all', status: 'all', channel: 'all', line: 'all' }

export function FilterBar({ filters, onChange, procedures, channels, lines, hasUnknownLine, lineCounts, attendants, refTime, range }: Props) {
  const dirty =
    filters.preset !== 'all' ||
    filters.procedure !== 'all' ||
    filters.status !== 'all' ||
    filters.channel !== 'all' ||
    filters.line !== 'all'
  return (
    <div className="filterbar" role="region" aria-label="Filtros">
      {lines.length > 1 && (
        <LineFilter
          lines={lines}
          hasUnknownLine={hasUnknownLine}
          counts={lineCounts}
          attendants={attendants}
          value={filters.line}
          onChange={(line) => onChange({ ...filters, line })}
        />
      )}
      <div className="segmented" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={filters.preset === p.id}
            onClick={() => onChange({ ...filters, preset: p.id, from: filters.from || range.from, to: filters.to || range.to })}
          >
            {p.label}
          </button>
        ))}
      </div>
      {filters.preset === 'custom' && (
        <label className="control" title="Intervalo personalizado">
          <CalendarRange size={14} aria-hidden />
          <input
            type="date"
            aria-label="De"
            value={filters.from || range.from}
            max={filters.to || range.to}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
          <span className="muted">até</span>
          <input
            type="date"
            aria-label="Até"
            value={filters.to || range.to}
            min={filters.from || range.from}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </label>
      )}
      <label className="control">
        <Filter size={14} aria-hidden />
        <select aria-label="Procedimento" value={filters.procedure} onChange={(e) => onChange({ ...filters, procedure: e.target.value })}>
          <option value="all">Todos os procedimentos</option>
          {procedures.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="control">
        <select aria-label="Status manual" value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value })}>
          <option value="all">Todos os status</option>
          <option value="sem_status">Sem status</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="control">
        <select aria-label="Canal de origem" value={filters.channel} onChange={(e) => onChange({ ...filters, channel: e.target.value })}>
          <option value="all">Todos os canais</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
        <button type="button" className="btn ghost sm" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw size={13} aria-hidden /> Limpar
        </button>
      )}
      <span className="spacer" />
      <span className="pill-note" title="Os cálculos de espera usam a última mensagem da base como referência">
        {fmtDateKey(range.from)} – {fmtDateKey(range.to)} · referência {fmtDateTime(refTime)}
      </span>
    </div>
  )
}
