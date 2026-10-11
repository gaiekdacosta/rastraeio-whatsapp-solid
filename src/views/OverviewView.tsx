import { useMemo } from 'react'
import { AlertCircle, Inbox, Send, Tags, Timer, UserPlus, Users } from 'lucide-react'
import type { Conversation, Message } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { Palette } from '../theme'
import {
  LINE_NONE,
  awaitingList,
  countBy,
  leadConversations,
  lineSummary,
  manualStatusCounts,
  median,
  messagesPerDay,
  newLeadsPerWeek,
  shareWithin,
} from '../lib/analytics'
import { fmtDateKey, fmtHours, fmtInt, fmtLine, fmtMinutes, fmtPct, fromDateKey, toDateKey } from '../lib/format'
import { STAGE_LABEL, STAGE_ORDER, STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import type { OverviewId } from '../lib/overview'
import { StatTile } from '../components/StatTile'
import { ChartCard } from '../components/ChartCard'
import { Legend } from '../components/ChartTooltip'
import { TwoSeriesLine } from '../components/charts/TwoSeriesLine'
import { ColumnBars } from '../components/charts/ColumnBars'
import { HBars } from '../components/charts/HBars'
import { StatusBadge } from '../components/StatusBadge'
import { useLineNames } from '../lineNames'

interface Props {
  convs: Conversation[]
  msgs: Message[]
  range: { from: string; to: string }
  meta: MetaMap
  palette: Palette
  clinicPhones: string[]
  attendants: Map<string, string[]>
  activeLine: string
  /** Blocos que esta pessoa vê (o administrador escolhe por usuário na aba Usuários). */
  visible: Set<OverviewId>
  /** Só para o administrador: nome do cliente dono de cada número, para a tabela por número. */
  clientOf?: (line: string) => string | undefined
  onFilterLine: (line: string) => void
  onOpenConv: (key: string) => void
}

const KPIS: OverviewId[] = ['leads', 'novos-leads', 'recebidas', 'enviadas', 'primeira-resposta', 'aguardando-resposta', 'sem-status']
const CARDS: OverviewId[] = ['atendimento-numero', 'mensagens-dia', 'leads-semana', 'procedimentos', 'estagio', 'status-manual', 'aguardando']

export function OverviewView({ convs, msgs, range, meta, palette, clinicPhones, attendants, activeLine, visible, clientOf, onFilterLine, onOpenConv }: Props) {
  const multiLine = clinicPhones.length > 1
  const show = (id: OverviewId) => visible.has(id)
  const { label, isRenamed } = useLineNames()
  const leads = useMemo(() => leadConversations(convs, meta), [convs, meta])
  const newLeads = useMemo(
    () =>
      leads.filter((c) => {
        const k = toDateKey(c.firstAt)
        return k >= range.from && k <= range.to
      }),
    [leads, range],
  )
  const received = msgs.filter((m) => m.direction === 'Recebida').length
  const sent = msgs.length - received
  const days = Math.max(1, Math.round((fromDateKey(range.to).getTime() - fromDateKey(range.from).getTime()) / 86400000) + 1)
  const firstTimes = leads.map((c) => c.firstResponseMin).filter((v): v is number => v != null)
  const firstResp = median(firstTimes)
  const within15 = shareWithin(firstTimes, 15)
  const awaiting = awaitingList(leads)
  const awaiting24 = awaiting.filter((c) => c.awaitingHours >= 24).length
  const noStatus = leads.filter((c) => !meta[c.key]?.status).length

  const perDay = useMemo(() => messagesPerDay(msgs, range), [msgs, range])
  const perWeek = useMemo(() => newLeadsPerWeek(leads, range), [leads, range])
  const byProcedure = useMemo(() => countBy(leads, (c) => c.procedure, 8), [leads])
  const stageRows = useMemo(
    () => STAGE_ORDER.map((s) => ({ name: STAGE_LABEL[s], value: leads.filter((c) => c.stage === s).length })).filter((r) => r.value > 0),
    [leads],
  )
  const statusRows = useMemo(() => manualStatusCounts(leads, meta, STATUS_ORDER, STATUS_LABEL).filter((r) => r.value > 0), [leads, meta])
  const lineRows = useMemo(
    () => (multiLine ? lineSummary(leads, msgs, range, clinicPhones, attendants) : []),
    [multiLine, leads, msgs, range, clinicPhones, attendants],
  )
  const multiLineConvs = useMemo(() => leads.filter((c) => c.lines.length > 1).length, [leads])

  const series = [
    { key: 'recebidas', label: 'Recebidas (leads)', color: palette.series1 },
    { key: 'enviadas', label: 'Enviadas (clínica)', color: palette.series2 },
  ]

  const anyKpi = KPIS.some(show)
  // A tabela por número só existe com mais de um número liberado; sem isso, não conta como bloco visível.
  const anyCard = CARDS.some((id) => show(id) && (id !== 'atendimento-numero' || multiLine))

  if (!anyKpi && !anyCard) {
    return (
      <section className="card" aria-label="Visão geral">
        <div className="empty">Nenhum bloco da Visão geral foi liberado para você. Fale com o administrador.</div>
      </section>
    )
  }

  return (
    <>
      {anyKpi && (
        <div className="grid grid-kpi">
          {show('leads') && (
            <StatTile icon={<Users size={14} />} label="Conversas de leads" value={fmtInt(leads.length)} hint={convs.length - leads.length === 1 ? '1 grupo ou não-lead fora da conta' : `${fmtInt(convs.length - leads.length)} grupos ou não-leads fora da conta`} />
          )}
          {show('novos-leads') && (
            <StatTile icon={<UserPlus size={14} />} label="Novos leads no período" value={fmtInt(newLeads.length)} hint={`${fmtInt((newLeads.length / days) * 7)} por semana em média`} />
          )}
          {show('recebidas') && <StatTile icon={<Inbox size={14} />} label="Mensagens recebidas" value={fmtInt(received)} hint={`${fmtInt(received / days)} por dia`} />}
          {show('enviadas') && (
            <StatTile icon={<Send size={14} />} label="Mensagens enviadas" value={fmtInt(sent)} hint={received ? `${(sent / received).toFixed(1).replace('.', ',')} enviadas por recebida` : '—'} />
          )}
          {show('primeira-resposta') && (
            <StatTile
              icon={<Timer size={14} />}
              label="Mediana da 1ª resposta"
              value={fmtMinutes(firstResp)}
              hint={Number.isFinite(within15) ? `${fmtPct(within15)} respondidas em até 15 min` : 'sem respostas no período'}
              tone={within15 >= 0.5 ? 'good' : undefined}
            />
          )}
          {show('aguardando-resposta') && (
            <StatTile
              icon={<AlertCircle size={14} />}
              label="Aguardando resposta da clínica"
              value={fmtInt(awaiting.length)}
              hint={awaiting24 ? `${fmtInt(awaiting24)} esperando há mais de 24h` : 'nenhum lead esperando há mais de 24h'}
              tone={awaiting24 ? 'bad' : 'good'}
            />
          )}
          {show('sem-status') && (
            <StatTile icon={<Tags size={14} />} label="Sem status manual" value={fmtInt(noStatus)} hint={leads.length ? `${fmtPct(1 - noStatus / leads.length)} dos leads já classificados` : '—'} />
          )}
        </div>
      )}

      {anyCard && (
        <div className="grid grid-2 blocks-grid">
          {multiLine && show('atendimento-numero') && (
            <section className="card span-2" aria-label="Atendimento por número">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Atendimento por número</h3>
                  <p className="card-sub">
                    Cada conversa conta para o número da empresa que mais respondeu nela. Clique em uma linha para filtrar o dashboard por esse número.
                  </p>
                </div>
              </div>
              {lineRows.length === 0 ? (
                <div className="empty">Sem conversas de leads no período selecionado.</div>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th className="num">Conversas de leads</th>
                        <th className="num">Novos leads</th>
                        <th className="num">Recebidas</th>
                        <th className="num">Enviadas</th>
                        <th className="num">Mediana 1ª resposta</th>
                        <th className="num">1ª resposta em até 15 min</th>
                        <th className="num">Aguardando resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineRows.map((r) => {
                        const value = r.line || LINE_NONE
                        const active = activeLine === value
                        return (
                          <tr
                            key={value}
                            className={`clickable${active ? ' selected' : ''}`}
                            onClick={() => onFilterLine(value)}
                            title={active ? 'Remover filtro de número' : 'Filtrar o dashboard por este número'}
                          >
                            <td>
                              <b>{label(r.line)}</b>
                              {r.line ? (
                                <div className="small muted truncate" title={r.attendants.join(', ')}>
                                  {[clientOf?.(r.line) ?? '', isRenamed(r.line) ? fmtLine(r.line) : '', r.attendants.join(', ')].filter(Boolean).join(' · ') || '—'}
                                </div>
                              ) : (
                                <div className="small muted" title="As mensagens recebidas não informam para qual número foram enviadas">
                                  Leads que nunca receberam resposta
                                </div>
                              )}
                            </td>
                            <td className="num">
                              {fmtInt(r.leads)} <span className="muted small">({fmtPct(leads.length ? r.leads / leads.length : NaN)})</span>
                            </td>
                            <td className="num">{fmtInt(r.newLeads)}</td>
                            <td className="num">{fmtInt(r.received)}</td>
                            <td className="num">{fmtInt(r.sent)}</td>
                            <td className="num">{fmtMinutes(r.firstResponseMin)}</td>
                            <td className="num">{fmtPct(r.within15)}</td>
                            <td className="num">{fmtInt(r.awaiting)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {multiLineConvs > 0 && (
                <p className="small muted" style={{ marginTop: 8 }}>
                  {multiLineConvs === 1 ? '1 conversa teve' : `${fmtInt(multiLineConvs)} conversas tiveram`} mais de um número respondendo; o número de cada mensagem
                  aparece no detalhe da conversa.
                </p>
              )}
            </section>
          )}

          {show('mensagens-dia') && (
            <div className="span-2">
              <ChartCard
                title="Mensagens por dia"
                subtitle="Volume diário de mensagens recebidas dos leads e enviadas pela clínica"
                rows={perDay}
                columns={[
                  { key: 'date', label: 'Dia', format: (v) => fmtDateKey(String(v)) },
                  { key: 'recebidas', label: 'Recebidas', numeric: true },
                  { key: 'enviadas', label: 'Enviadas', numeric: true },
                ]}
                legend={<Legend items={series} />}
              >
                <TwoSeriesLine
                  data={perDay}
                  xKey="label"
                  series={series}
                  palette={palette}
                  titleFormatter={(_l, row) => (row ? fmtDateKey(String(row.date)) : '')}
                />
              </ChartCard>
            </div>
          )}

          {show('leads-semana') && (
            <ChartCard
              title="Novos leads por semana"
              subtitle="Conversas cuja primeira mensagem ocorreu na semana (segunda a domingo)"
              rows={perWeek}
              columns={[
                { key: 'label', label: 'Semana de' },
                { key: 'leads', label: 'Novos leads', numeric: true },
              ]}
            >
              <ColumnBars
                data={perWeek}
                xKey="label"
                yKey="leads"
                label="Novos leads"
                palette={palette}
                directLabels
                titleFormatter={(l) => `Semana de ${String(l)}`}
              />
            </ChartCard>
          )}

          {show('procedimentos') && (
            <ChartCard
              title="Procedimentos de interesse"
              subtitle="Identificado pela mensagem inicial do anúncio ou por palavras-chave do lead"
              rows={byProcedure}
              columns={[
                { key: 'name', label: 'Procedimento' },
                { key: 'value', label: 'Leads', numeric: true },
              ]}
            >
              <HBars data={byProcedure} label="Leads" palette={palette} />
            </ChartCard>
          )}

          {show('estagio') && (
            <ChartCard
              title="Estágio inferido das conversas"
              subtitle="Classificação automática pelo conteúdo das mensagens"
              rows={stageRows}
              columns={[
                { key: 'name', label: 'Estágio' },
                { key: 'value', label: 'Conversas', numeric: true },
              ]}
            >
              <HBars data={stageRows} label="Conversas" palette={palette} labelWidth={170} />
            </ChartCard>
          )}

          {show('status-manual') && (
            <ChartCard
              title="Status manual"
              subtitle="Classificação feita pela equipe na aba Conversas"
              rows={statusRows}
              columns={[
                { key: 'name', label: 'Status' },
                { key: 'value', label: 'Conversas', numeric: true },
              ]}
            >
              <HBars data={statusRows} label="Conversas" palette={palette} />
            </ChartCard>
          )}

          {show('aguardando') && (
            <section className="card span-2" aria-label="Leads aguardando resposta">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Leads aguardando resposta da clínica</h3>
                  <p className="card-sub">Última mensagem da conversa foi do lead. Ordenado por tempo de espera.</p>
                </div>
              </div>
              {awaiting.length === 0 ? (
                <div className="empty">Nenhum lead aguardando resposta no período. 🎉</div>
              ) : (
                <div className="table-scroll" style={{ maxHeight: 300 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Procedimento</th>
                        {multiLine && <th>Número</th>}
                        <th>Última mensagem</th>
                        <th className="num">Esperando há</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awaiting.slice(0, 12).map((c) => {
                        const last = c.messages[c.messages.length - 1]
                        return (
                          <tr key={c.key} className="clickable" onClick={() => onOpenConv(c.key)} title="Abrir conversa">
                            <td>{c.name}</td>
                            <td>{c.procedure}</td>
                            {multiLine && <td>{label(c.line)}</td>}
                            <td className="truncate">{last.isMedia ? 'Mídia' : last.text}</td>
                            <td className="num">{fmtHours(c.awaitingHours)}</td>
                            <td>
                              <StatusBadge small status={meta[c.key]?.status} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  )
}
