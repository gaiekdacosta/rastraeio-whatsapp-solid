import { useMemo, useState } from 'react'
import { AlertCircle, Flame, Inbox, Send, Tags, Timer, UserPlus, Users } from 'lucide-react'
import type { Conversation, ExtraColumns, Message } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { Palette } from '../theme'
import {
  AD_METRICS,
  LINE_NONE,
  adSummary,
  awaitingList,
  countBy,
  leadConversations,
  lineSummary,
  manualStatusCounts,
  median,
  messagesPerDay,
  newLeadsPerWeek,
  rankAds,
  shareWithin,
  temperatureCounts,
} from '../lib/analytics'
import type { AdMetric } from '../lib/analytics'
import { fmtDateKey, fmtHours, fmtInt, fmtLine, fmtMinutes, fmtPct, fromDateKey, toDateKey } from '../lib/format'
import { STAGE_LABEL, STAGE_ORDER, STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { TEMPERATURE_LABEL, TEMPERATURE_NONE_LABEL } from '../lib/temperature'
import type { OverviewId } from '../lib/overview'
import { StatTile } from '../components/StatTile'
import { ChartCard } from '../components/ChartCard'
import { Legend } from '../components/ChartTooltip'
import { TwoSeriesLine } from '../components/charts/TwoSeriesLine'
import { ColumnBars } from '../components/charts/ColumnBars'
import { HBars } from '../components/charts/HBars'
import { StackedHBars } from '../components/charts/StackedHBars'
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
  /** Colunas opcionais encontradas na planilha (Temperatura, Anúncio), para explicar blocos vazios. */
  columns: ExtraColumns
  /** Blocos que esta pessoa vê (o administrador escolhe por usuário na aba Usuários). */
  visible: Set<OverviewId>
  /** Só para o administrador: nome do cliente dono de cada número, para a tabela por número. */
  clientOf?: (line: string) => string | undefined
  onFilterLine: (line: string) => void
  onOpenConv: (key: string) => void
}

const KPIS: OverviewId[] = ['leads', 'novos-leads', 'recebidas', 'enviadas', 'primeira-resposta', 'aguardando-resposta', 'sem-status', 'leads-quentes']
const CARDS: OverviewId[] = ['atendimento-numero', 'mensagens-dia', 'leads-semana', 'procedimentos', 'estagio', 'status-manual', 'temperatura', 'anuncios', 'aguardando']

const AD_TOP = 10

/** Cor de cada linha do gráfico de temperatura, pelo rótulo. */
export function temperatureColors(palette: Palette, names: string[]): string[] {
  const byLabel: Record<string, string> = {
    [TEMPERATURE_LABEL.quente]: palette.temperature.quente,
    [TEMPERATURE_LABEL.morno]: palette.temperature.morno,
    [TEMPERATURE_LABEL.frio]: palette.temperature.frio,
    [TEMPERATURE_NONE_LABEL]: palette.temperature.none,
  }
  return names.map((n) => byLabel[n] ?? palette.series1)
}

export function OverviewView({ convs, msgs, range, meta, palette, clinicPhones, attendants, activeLine, columns, visible, clientOf, onFilterLine, onOpenConv }: Props) {
  const multiLine = clinicPhones.length > 1
  const show = (id: OverviewId) => visible.has(id)
  const { label, isRenamed } = useLineNames()
  const [adMetric, setAdMetric] = useState<AdMetric>('leads')
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

  // Temperatura (coluna da planilha) e anúncios (coluna da planilha ou mensagem inicial do anúncio).
  const hasTemperature = useMemo(() => leads.some((c) => c.temperature), [leads])
  const hot = leads.filter((c) => c.temperature === 'quente').length
  const warm = leads.filter((c) => c.temperature === 'morno').length
  const cold = leads.filter((c) => c.temperature === 'frio').length
  const tempRows = useMemo(() => (hasTemperature ? temperatureCounts(leads) : []), [hasTemperature, leads])
  const adRows = useMemo(() => rankAds(adSummary(leads, meta), adMetric), [leads, meta, adMetric])
  const adTop = useMemo(() => adRows.slice(0, AD_TOP).map((r) => ({ ...r, name: r.ad })), [adRows])
  const noAd = leads.length - adRows.reduce((s, r) => s + r.leads, 0)
  const totalSales = adRows.reduce((s, r) => s + r.vendas, 0)
  const fromSheet = adRows.some((r) => r.source === 'planilha')
  const metric = AD_METRICS.find((m) => m.id === adMetric) ?? AD_METRICS[0]
  const tempSeries = [
    { key: 'quente', label: TEMPERATURE_LABEL.quente, color: palette.temperature.quente },
    { key: 'morno', label: TEMPERATURE_LABEL.morno, color: palette.temperature.morno },
    { key: 'frio', label: TEMPERATURE_LABEL.frio, color: palette.temperature.frio },
    { key: 'semTemperatura', label: TEMPERATURE_NONE_LABEL, color: palette.temperature.none },
  ]

  const series = [
    { key: 'recebidas', label: 'Recebidas (leads)', color: palette.series1 },
    { key: 'enviadas', label: 'Enviadas (clínica)', color: palette.series2 },
  ]

  // Indicador de leads quentes só faz sentido quando a planilha traz temperatura.
  const anyKpi = KPIS.some((id) => show(id) && (id !== 'leads-quentes' || hasTemperature))
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
          {show('leads-quentes') && hasTemperature && (
            <StatTile
              icon={<Flame size={14} />}
              label="Leads quentes"
              value={fmtInt(hot)}
              hint={`${fmtPct(leads.length ? hot / leads.length : NaN)} dos leads · ${fmtInt(warm)} mornos · ${fmtInt(cold)} frios`}
              tone={hot ? 'good' : undefined}
            />
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

          {show('anuncios') && (
            <div className="span-2">
              <ChartCard
                title="Anúncios"
                subtitle={
                  fromSheet
                    ? 'Leads por anúncio de origem (coluna Anúncio da planilha), com a temperatura, os agendamentos e as vendas de cada um'
                    : 'Leads por anúncio de origem, identificado pela mensagem padrão com que o lead chegou; adicione a coluna Anúncio na planilha para usar o nome exato'
                }
                rows={adRows}
                columns={[
                  { key: 'ad', label: 'Anúncio' },
                  { key: 'leads', label: 'Leads', numeric: true },
                  { key: 'quente', label: 'Quentes', numeric: true },
                  { key: 'morno', label: 'Mornos', numeric: true },
                  { key: 'frio', label: 'Frios', numeric: true },
                  { key: 'agendados', label: 'Agendados', numeric: true },
                  { key: 'vendas', label: 'Vendas', numeric: true },
                ]}
                emptyText={
                  columns.ad
                    ? 'Nenhum lead com anúncio preenchido no período selecionado.'
                    : 'Nenhum anúncio identificado: adicione a coluna Anúncio na planilha (de qual anúncio cada lead veio) ou use a mensagem padrão do anúncio no WhatsApp.'
                }
                legend={adMetric === 'leads' && hasTemperature ? <Legend items={tempSeries} mark="rect" /> : undefined}
                actions={
                  <label className="control sm" title="Ordenar os anúncios pela métrica">
                    <select aria-label="Ordenar anúncios por" value={adMetric} onChange={(e) => setAdMetric(e.target.value as AdMetric)}>
                      {AD_METRICS.map((m) => (
                        <option key={m.id} value={m.id} disabled={!hasTemperature && (m.id === 'quente' || m.id === 'morno' || m.id === 'frio')}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              >
                {adMetric === 'leads' && hasTemperature ? (
                  <StackedHBars data={adTop} nameKey="name" series={tempSeries} totalKey="leads" palette={palette} labelWidth={260} />
                ) : (
                  <HBars data={adTop.map((r) => ({ name: r.name, value: r[adMetric] as number }))} label={metric.short} palette={palette} labelWidth={260} />
                )}
                {adMetric === 'vendas' && totalSales === 0 && (
                  <div className="callout" style={{ marginTop: 8 }}>
                    Nenhuma venda registrada no período. Marque as conversas que viraram venda com o status <b>Convertido</b> (na aba Conversas ou na coluna status_manual da
                    planilha) para o ranking de vendas funcionar.
                  </div>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>
                  {adRows.length > AD_TOP ? `${AD_TOP} de ${fmtInt(adRows.length)} anúncios no gráfico (a tabela tem todos). ` : ''}
                  {noAd > 0 ? `${fmtInt(noAd)} ${noAd === 1 ? 'lead sem anúncio identificado' : 'leads sem anúncio identificado'}. ` : ''}
                  Agendados = agendamento ou pagamento sinalizado na conversa, ou status Agendado/Convertido. Vendas = conversas com status Convertido.
                </p>
              </ChartCard>
            </div>
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

          {show('temperatura') && (
            <ChartCard
              title="Temperatura dos leads"
              subtitle="Frio, morno ou quente, conforme a coluna Temperatura da planilha"
              rows={tempRows}
              columns={[
                { key: 'name', label: 'Temperatura' },
                { key: 'value', label: 'Leads', numeric: true },
              ]}
              emptyText={
                columns.temperature
                  ? 'Nenhum lead com temperatura preenchida no período selecionado.'
                  : 'A planilha não tem a coluna Temperatura. Adicione uma coluna com esse nome e preencha com frio, morno ou quente.'
              }
            >
              <HBars data={tempRows} label="Leads" palette={palette} colors={temperatureColors(palette, tempRows.map((r) => r.name))} />
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
