import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ExternalLink, Phone, Search } from 'lucide-react'
import type { Conversation, ConvMeta, Status } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { fmtDateKey, fmtDateTime, fmtHours, fmtInt, fmtLine, fmtMinutes, fmtPhone, fmtShortDate, fmtTime, toDateKey } from '../lib/format'
import { StageBadge, StatusBadge } from '../components/StatusBadge'
import { useMediaQuery } from '../hooks'
import { useLineNames } from '../lineNames'

type Sort = 'recent' | 'oldest' | 'messages' | 'waiting'

interface Props {
  convs: Conversation[]
  allConvs: Conversation[]
  meta: MetaMap
  onMeta: (key: string, patch: Partial<ConvMeta>) => void
  selectedKey: string | null
  onSelect: (key: string | null) => void
  refTime: Date
  multiLine: boolean
}

export function ConversationsView({ convs, allConvs, meta, onMeta, selectedKey, onSelect, refTime, multiLine }: Props) {
  const [search, setSearch] = useState('')
  const [onlyAwaiting, setOnlyAwaiting] = useState(false)
  const [onlyNoStatus, setOnlyNoStatus] = useState(false)
  const [hideGroups, setHideGroups] = useState(true)
  const [sort, setSort] = useState<Sort>('recent')
  const isWide = useMediaQuery('(min-width: 960px)')
  const { names, label } = useLineNames()

  const index = useMemo(
    () =>
      new Map(
        allConvs.map((c) => [
          c.key,
          `${c.name} ${c.phone} ${c.lines.join(' ')} ${c.procedure} ${c.messages.map((m) => m.text).join(' ')}`.toLowerCase(),
        ]),
      ),
    [allConvs],
  )

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = convs.filter((c) => {
      if (hideGroups && (c.isGroup || c.isInternal)) return false
      if (onlyAwaiting && !c.awaitingReply) return false
      if (onlyNoStatus && meta[c.key]?.status) return false
      if (q && !(index.get(c.key) ?? '').includes(q) && !c.lines.some((l) => names[l]?.toLowerCase().includes(q))) return false
      return true
    })
    switch (sort) {
      case 'oldest':
        out.sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime())
        break
      case 'messages':
        out.sort((a, b) => b.messages.length - a.messages.length)
        break
      case 'waiting':
        out.sort((a, b) => b.awaitingHours - a.awaitingHours)
        break
      default:
        out.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    }
    return out
  }, [convs, search, onlyAwaiting, onlyNoStatus, hideGroups, sort, meta, index, names])

  const selected = selectedKey ? allConvs.find((c) => c.key === selectedKey) ?? null : null
  const todayKey = toDateKey(refTime)

  return (
    <div className="conv-layout">
      {(isWide || !selected) && (
        <section className="card" aria-label="Lista de conversas">
          <div className="conv-toolbar">
            <div className="row">
              <label className="control search">
                <Search size={14} aria-hidden />
                <input
                  type="search"
                  placeholder="Buscar por nome, telefone ou texto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar conversas"
                />
              </label>
              <label className="control">
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
                  <option value="recent">Mais recentes</option>
                  <option value="oldest">Mais antigas</option>
                  <option value="messages">Mais mensagens</option>
                  <option value="waiting">Maior espera</option>
                </select>
              </label>
            </div>
            <div className="row small" style={{ color: 'var(--ink-2)', gap: 14 }}>
              <label>
                <input type="checkbox" checked={onlyAwaiting} onChange={(e) => setOnlyAwaiting(e.target.checked)} /> Aguardando resposta
              </label>
              <label>
                <input type="checkbox" checked={onlyNoStatus} onChange={(e) => setOnlyNoStatus(e.target.checked)} /> Sem status
              </label>
              <label>
                <input type="checkbox" checked={hideGroups} onChange={(e) => setHideGroups(e.target.checked)} /> Ocultar grupos{multiLine ? ' e internas' : ''}
              </label>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {fmtInt(list.length)} conversas
              </span>
            </div>
          </div>
          <div className="conv-list" role="listbox" aria-label="Conversas">
            {list.length === 0 && <div className="empty">Nenhuma conversa com esses filtros.</div>}
            {list.map((c) => {
              const last = c.messages[c.messages.length - 1]
              const st = meta[c.key]?.status
              return (
                <button
                  key={c.key}
                  type="button"
                  role="option"
                  className="conv-item"
                  aria-selected={c.key === selectedKey}
                  onClick={() => onSelect(c.key)}
                >
                  <span className="name">
                    {c.awaitingReply && <i className="dot alert" title="Aguardando resposta da clínica" />}
                    {c.name}
                  </span>
                  <span className="when">{last.dateKey === todayKey ? fmtTime(last.at) : fmtShortDate(last.at)}</span>
                  <span className="preview">
                    {last.direction === 'Enviada' ? 'Você: ' : ''}
                    {last.isMedia ? '📎 Mídia' : last.text}
                  </span>
                  <span className="meta">
                    <StatusBadge small status={st} />
                    <span className="badge sm outline">{c.procedure}</span>
                    {multiLine && (
                      <span className="badge sm outline" title="Número da empresa que atendeu">
                        <Phone size={10} aria-hidden />
                        {c.line ? label(c.line) : 'Nº não identificado'}
                      </span>
                    )}
                    {c.isGroup && <span className="badge sm">Grupo</span>}
                    {c.isInternal && <span className="badge sm">Interna</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {(isWide || selected) && (
        <section className="card conv-detail" aria-label="Detalhe da conversa">
          {selected ? (
            <Detail
              conv={selected}
              meta={meta[selected.key] ?? {}}
              onMeta={onMeta}
              onBack={isWide ? undefined : () => onSelect(null)}
              multiLine={multiLine}
            />
          ) : (
            <div className="empty" style={{ margin: 'auto' }}>
              Selecione uma conversa para ver as mensagens e definir status, follow-up e notas.
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Detail({
  conv,
  meta,
  onMeta,
  onBack,
  multiLine,
}: {
  conv: Conversation
  meta: ConvMeta
  onMeta: (key: string, patch: Partial<ConvMeta>) => void
  onBack?: () => void
  multiLine: boolean
}) {
  const threadRef = useRef<HTMLDivElement>(null)
  const { label, isRenamed } = useLineNames()
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conv.key])

  let lastDay = ''
  return (
    <>
      <div className="conv-header">
        <div style={{ minWidth: 0 }}>
          {onBack && (
            <button type="button" className="btn ghost sm" onClick={onBack} style={{ marginBottom: 6 }}>
              <ChevronLeft size={14} aria-hidden /> Voltar
            </button>
          )}
          <h2>{conv.name}</h2>
          <div className="sub">
            {fmtPhone(conv.phone)} · primeiro contato {fmtDateTime(conv.firstAt)} · última mensagem {fmtDateTime(conv.lastAt)}
          </div>
          <div className="tags">
            <StatusBadge status={meta.status} />
            <StageBadge stage={conv.stage} />
            {multiLine && (
              <span className="badge outline" title="Número da empresa que mais respondeu nesta conversa">
                <Phone size={12} aria-hidden />
                {conv.line ? `Atendido por ${label(conv.line)}${isRenamed(conv.line) ? ` · ${fmtLine(conv.line)}` : ''}` : 'Número não identificado'}
              </span>
            )}
            {conv.lines.length > 1 && (
              <span className="badge outline" title="Outros números da empresa que também responderam">
                também {conv.lines.slice(1).map(label).join(', ')}
              </span>
            )}
            <span className="badge outline">{conv.procedure}</span>
            <span className="badge outline">{conv.channel}</span>
            {conv.askedPrice && <span className="badge outline">Perguntou valor</span>}
            {conv.askedAddress && <span className="badge outline">Pediu endereço</span>}
          </div>
        </div>
        {!conv.isGroup && (
          <a className="btn sm" href={`https://wa.me/${conv.phone}`} target="_blank" rel="noreferrer">
            <ExternalLink size={13} aria-hidden /> Abrir no WhatsApp
          </a>
        )}
      </div>

      <div className="conv-manage">
        <div className="field">
          <label htmlFor="status-select">Status manual</label>
          <select
            id="status-select"
            value={meta.status ?? ''}
            onChange={(e) => onMeta(conv.key, { status: (e.target.value || undefined) as Status | undefined })}
          >
            <option value="">Sem status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="followup-input">Follow-up em</label>
          <input id="followup-input" type="date" value={meta.followUp ?? ''} onChange={(e) => onMeta(conv.key, { followUp: e.target.value || undefined })} />
        </div>
        <div className="field">
          <label htmlFor="notes-input">Notas internas</label>
          <textarea
            id="notes-input"
            rows={1}
            placeholder="Objeções, combinados, valores passados…"
            value={meta.notes ?? ''}
            onChange={(e) => onMeta(conv.key, { notes: e.target.value })}
          />
        </div>
      </div>

      <div className="conv-stats">
        <span>
          <b>{fmtInt(conv.received)}</b> recebidas
        </span>
        <span>
          <b>{fmtInt(conv.sent)}</b> enviadas
        </span>
        <span>
          <b>{fmtInt(conv.media)}</b> mídias
        </span>
        <span>
          1ª resposta <b>{fmtMinutes(conv.firstResponseMin)}</b>
        </span>
        <span>
          mediana de resposta <b>{fmtMinutes(conv.medianResponseMin)}</b>
        </span>
        {conv.awaitingReply && (
          <span style={{ color: 'var(--critical-text)' }}>
            aguardando resposta há <b>{fmtHours(conv.awaitingHours)}</b>
          </span>
        )}
        {meta.updatedAt && <span className="muted">classificado em {fmtDateTime(new Date(meta.updatedAt))}</span>}
      </div>

      <div className="thread" ref={threadRef} aria-label="Mensagens">
        {conv.messages.map((m) => {
          const sep = m.dateKey !== lastDay
          lastDay = m.dateKey
          const out = m.direction === 'Enviada'
          return (
            <Fragment key={m.id}>
              {sep && <div className="day-sep">{fmtDateKey(m.dateKey)}</div>}
              <div className={`bubble${out ? ' out' : ''}${m.isMedia ? ' media' : ''}`}>
                {m.isMedia ? 'Mídia (imagem, áudio ou documento)' : m.text}
                <span className="time">
                  {out ? (multiLine ? `${m.lead || 'Empresa'} · ${label(m.phone)} · ` : 'Clínica · ') : `${m.lead || 'Lead'} · `}
                  {fmtTime(m.at)}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
