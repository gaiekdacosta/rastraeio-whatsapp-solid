import { CalendarRange, Filter, Megaphone, Phone, RefreshCw, RotateCcw, Tags, X } from 'lucide-react'
import type { Filters, RangePreset } from '../lib/types'
import type { Client } from '../lib/clients'
import { AD_NONE, AD_NONE_LABEL, LINE_NONE } from '../lib/analytics'
import { fmtDateKey, fmtDateTime, fmtTime } from '../lib/format'
import { STATUS_ORDER } from '../lib/status'
import { CLASS_NONE, CLASS_NONE_LABEL } from '../lib/classification'
import { useLineNames } from '../lineNames'
import { useVocab } from '../vocab'
import { ClientFilter } from './ClientFilter'
import { LineFilter } from './LineFilter'

/** Estado da leitura da planilha online, para o botão de atualizar. */
export interface LiveInfo {
  status: 'idle' | 'loading' | 'ok' | 'error'
  at: Date | null
  message: string | null
  intervaloSeg: number
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  procedures: string[]
  channels: string[]
  /** Classificações da base (coluna Classificação da planilha), na ordem dos gráficos; vazio = sem a coluna. */
  classes: string[]
  /** Anúncios identificados na base, em ordem alfabética. */
  ads: string[]
  /** A base tem leads sem anúncio identificado. */
  hasNoAd: boolean
  lines: string[]
  hasUnknownLine: boolean
  lineCounts: Map<string, number> // conversas de leads por número ('' = não identificado), com os demais filtros aplicados
  attendants: Map<string, string[]>
  refTime: Date
  range: { from: string; to: string }
  /** Só para o administrador: clientes (contas agrupadas por empresa) para trocar o painel inteiro. */
  clients?: Client[]
  clientCounts?: Map<string, number>
  clientTotal?: number
  /** Planilha online: última leitura e botão de atualizar agora. */
  live?: LiveInfo | null
  onRefresh?: () => void
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Mês atual' },
  { id: 'custom', label: 'Personalizado' },
]

export const DEFAULT_FILTERS: Filters = {
  preset: 'all',
  from: '',
  to: '',
  procedure: 'all',
  status: 'all',
  channel: 'all',
  line: 'all',
  cliente: 'all',
  classification: 'all',
  ad: 'all',
}

export function FilterBar({
  filters,
  onChange,
  procedures,
  channels,
  classes,
  ads,
  hasNoAd,
  lines,
  hasUnknownLine,
  lineCounts,
  attendants,
  refTime,
  range,
  clients,
  clientCounts,
  clientTotal,
  live,
  onRefresh,
}: Props) {
  const { label } = useLineNames()
  const v = useVocab()
  const hasClients = !!clients?.some((c) => !c.pseudo)
  // Com clientes, o filtro por número só aparece dentro de um cliente: sem cliente escolhido ele repetiria todos os números.
  const showLines = lines.length > 1 && (!hasClients || filters.cliente !== 'all')
  const showAds = ads.length > 0
  const dirty =
    filters.preset !== 'all' ||
    filters.procedure !== 'all' ||
    filters.status !== 'all' ||
    filters.channel !== 'all' ||
    filters.line !== 'all' ||
    filters.cliente !== 'all' ||
    filters.classification !== 'all' ||
    filters.ad !== 'all'
  return (
    <div className="filterbar" role="region" aria-label="Filtros">
      {hasClients && clients && (
        <ClientFilter
          clients={clients}
          counts={clientCounts ?? new Map()}
          total={clientTotal ?? 0}
          value={filters.cliente}
          onChange={(cliente) => onChange({ ...filters, cliente, line: 'all' })}
        />
      )}
      {showLines && (
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
        <select aria-label={v.Item} value={filters.procedure} onChange={(e) => onChange({ ...filters, procedure: e.target.value })}>
          <option value="all">Todos os {v.itens}</option>
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
              {v.status[s]}
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
      {classes.length > 0 && (
        <label className="control" title="Classificação do lead, conforme a coluna Classificação da planilha">
          <Tags size={14} aria-hidden />
          <select aria-label="Classificação do lead" value={filters.classification} onChange={(e) => onChange({ ...filters, classification: e.target.value })}>
            <option value="all">Todas as classificações</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={CLASS_NONE}>{CLASS_NONE_LABEL}</option>
          </select>
        </label>
      )}
      {showAds && (
        <label className="control" title="Anúncio que trouxe o lead (coluna Anúncio da planilha ou mensagem inicial do anúncio)">
          <Megaphone size={14} aria-hidden />
          <select aria-label="Anúncio" value={filters.ad} onChange={(e) => onChange({ ...filters, ad: e.target.value })}>
            <option value="all">Todos os anúncios</option>
            {ads.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {hasNoAd && <option value={AD_NONE}>{AD_NONE_LABEL}</option>}
          </select>
        </label>
      )}
      {!showLines && filters.line !== 'all' && (
        <button type="button" className="btn ghost sm" title="Remover filtro de número" onClick={() => onChange({ ...filters, line: 'all' })}>
          <Phone size={13} aria-hidden /> {filters.line === LINE_NONE ? 'Não identificado' : label(filters.line)} <X size={12} aria-hidden />
        </button>
      )}
      {dirty && (
        <button type="button" className="btn ghost sm" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw size={13} aria-hidden /> Limpar
        </button>
      )}
      <span className="spacer" />
      {live && (
        <button
          type="button"
          className={`btn ghost sm live-btn${live.status === 'error' ? ' warn' : ''}`}
          onClick={onRefresh}
          disabled={live.status === 'loading'}
          title={
            live.status === 'error'
              ? live.message ?? 'Falha ao ler a planilha online'
              : `Planilha online, lida de novo a cada ${Math.round(live.intervaloSeg / 60)} min. Clique para atualizar agora.`
          }
        >
          <RefreshCw size={13} className={live.status === 'loading' ? 'spin' : undefined} aria-hidden />
          {live.status === 'loading' ? 'Atualizando…' : live.status === 'error' ? 'Falha ao atualizar' : live.at ? `Atualizado às ${fmtTime(live.at)}` : 'Atualizar'}
        </button>
      )}
      <span className="pill-note" title="Os cálculos de espera usam a última mensagem da base como referência">
        {fmtDateKey(range.from)} – {fmtDateKey(range.to)} · referência {fmtDateTime(refTime)}
      </span>
    </div>
  )
}
