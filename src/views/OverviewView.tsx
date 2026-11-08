import { useMemo, useState } from 'react'
import { AlertCircle, Flame, Inbox, Send, Tag, Tags, Timer, UserPlus, Users } from 'lucide-react'
import type { Conversation, ExtraColumns, Message } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { Palette } from '../theme'
import {
  LINE_NONE,
  adMetrics,
  adSummary,
  adValue,
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
  classificationCounts,
} from '../lib/analytics'
import type { AdMetric } from '../lib/analytics'
import { fmtDateKey, fmtHours, fmtInt, fmtLine, fmtMinutes, fmtPct, fromDateKey, toDateKey } from '../lib/format'
import { STAGE_ORDER, STATUS_ORDER } from '../lib/status'
import { CLASS_NONE_LABEL, classColors, classKey, classPlural } from '../lib/classification'
import type { Vocab } from '../lib/segment'
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
import { useVocab } from '../vocab'

interface Props {
  convs: Conversation[]
  msgs: Message[]
  range: { from: string; to: string }
  meta: MetaMap
  palette: Palette
  clinicPhones: string[]
  attendants: Map<string, string[]>
  activeLine: string
  /** Colunas opcionais encontradas na planilha (Classificação, Anúncio), para explicar blocos vazios. */
  columns: ExtraColumns
  /** Classificações da base inteira, na ordem dos gráficos (as cores seguem esta ordem). */
  classes: string[]
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

/** Cor de cada barra do gráfico de classificação, pelo rótulo (série única quando há classificações demais). */
export function classBarColors(palette: Palette, classes: string[], names: string[]): string[] {
  const colors = classColors(palette, classes)
  return names.map((n) => colors?.[n] ?? (n === CLASS_NONE_LABEL ? palette.temperature.none : palette.series1))
}

/** Séries da pilha de leads por classificação (null = classificações demais para empilhar). */
export function classSeries(palette: Palette, classes: string[]): { key: string; label: string; color: string }[] | null {
  const colors = classColors(palette, classes)
  if (!colors) return null
  return [
    ...classes.map((c) => ({ key: classKey(c), label: c, color: colors[c] })),
    { key: 'semClassificacao', label: CLASS_NONE_LABEL, color: colors[CLASS_NONE_LABEL] },
  ]
}

/** Indicador "Leads quentes" (escala de temperatura) ou, com outras classificações, "Leads classificados". */
export function classKpi(leads: { classification: string | null }[], classes: string[]): { title: string; value: number; hint: string; scale: boolean } {
  const count = (c: string) => leads.filter((l) => l.classification === c).length
  const pct = (n: number) => fmtPct(leads.length ? n / leads.length : NaN)
  if (classes.includes('Quente')) {
    const hot = count('Quente')
    const others = classes.filter((c) => c !== 'Quente').map((c) => `${fmtInt(count(c))} ${classPlural(c).toLowerCase()}`)
    return { title: 'Leads quentes', value: hot, hint: [`${pct(hot)} dos leads`, ...others].join(' · '), scale: true }
  }
  const classified = leads.filter((l) => l.classification).length
  const top = classes.map((c) => ({ c, n: count(c) })).sort((a, b) => b.n - a.n)[0]
  return {
    title: 'Leads classificados',
    value: classified,
    hint: top && top.n ? `${pct(classified)} dos leads · mais comum: ${top.c} (${fmtInt(top.n)})` : `${pct(classified)} dos leads`,
    scale: false,
  }
}

/** "Agendados = agendamento ou pagamento sinalizado na conversa, ou status Agendado/Convertido." */
export function closedRule(v: Vocab): string {
  return `${v.fechados} = ${v.fechamento} ou pagamento sinalizado na conversa, ou status ${v.status.agendado}/Convertido. Vendas = conversas com status Convertido.`
}

export function OverviewView({ convs, msgs, range, meta, palette, clinicPhones, attendants, activeLine, columns, classes, visible, clientOf, onFilterLine, onOpenConv }: Props) {
  const multiLine = clinicPhones.length > 1
  const show = (id: OverviewId) => visible.has(id)
  const { label, isRenamed } = useLineNames()
  const v = useVocab()
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
    () => STAGE_ORDER.map((s) => ({ name: v.stage[s], value: leads.filter((c) => c.stage === s).length })).filter((r) => r.value > 0),
    [leads, v],
  )
  const statusRows = useMemo(() => manualStatusCounts(leads, meta, STATUS_ORDER, v.status).filter((r) => r.value > 0), [leads, meta, v])
  const lineRows = useMemo(
    () => (multiLine ? lineSummary(leads, msgs, range, clinicPhones, attendants) : []),
    [multiLine, leads, msgs, range, clinicPhones, attendants],
  )
  const multiLineConvs = useMemo(() => leads.filter((c) => c.lines.length > 1).length, [leads])

  // Classificação (coluna da planilha) e anúncios (coluna da planilha ou mensagem inicial do anúncio).
  const hasClassification = useMemo(() => leads.some((c) => c.classification), [leads])
  const kpiClass = classKpi(leads, classes)
  const classRows = useMemo(() => (hasClassification ? classificationCounts(leads, classes) : []), [hasClassification, leads, classes])
  const metrics = useMemo(() => adMetrics(classes, v), [classes, v])
  // Classificação escolhida no seletor que sumiu da base (planilha mudou): volta para leads.
  const metric = metrics.find((m) => m.id === adMetric) ?? metrics[0]
  const adRows = useMemo(() => rankAds(adSummary(leads, meta), metric.id), [leads, meta, metric.id])
  const adTop = useMemo(() => adRows.slice(0, AD_TOP).map((r) => ({ ...r, name: r.ad })), [adRows])
  const noAd = leads.length - adRows.reduce((s, r) => s + r.leads, 0)
  const totalSales = adRows.reduce((s, r) => s + r.vendas, 0)
  const fromSheet = adRows.some((r) => r.source === 'planilha')
  const stack = hasClassification ? classSeries(palette, classes) : null

  const series = [
    { key: 'recebidas', label: 'Recebidas (leads)', color: palette.series1 },
    { key: 'enviadas', label: `Enviadas (${v.empresa})`, color: palette.series2 },
  ]

  // Indicador de classificação só faz sentido quando a planilha traz a coluna.
  const anyKpi = KPIS.some((id) => show(id) && (id !== 'leads-quentes' || hasClassification))
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
              label={`Aguardando resposta da ${v.empresa}`}
              value={fmtInt(awaiting.length)}
              hint={awaiting24 ? `${fmtInt(awaiting24)} esperando há mais de 24h` : 'nenhum lead esperando há mais de 24h'}
              tone={awaiting24 ? 'bad' : 'good'}
            />
          )}
          {show('sem-status') && (
            <StatTile icon={<Tags size={14} />} label="Sem status manual" value={fmtInt(noStatus)} hint={leads.length ? `${fmtPct(1 - noStatus / leads.length)} dos leads já com status` : '—'} />
          )}
          {show('leads-quentes') && hasClassification && (
            <StatTile
              icon={kpiClass.scale ? <Flame size={14} /> : <Tag size={14} />}
              label={kpiClass.title}
              value={fmtInt(kpiClass.value)}
              hint={kpiClass.hint}
              tone={kpiClass.scale && kpiClass.value ? 'good' : undefined}
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
                    ? `Leads por anúncio de origem (coluna Anúncio da planilha), com a classificação, os ${v.fechamentos} e as vendas de cada um`
                    : 'Leads por anúncio de origem, identificado pela mensagem padrão com que o lead chegou; adicione a coluna Anúncio na planilha para usar o nome exato'
                }
                rows={adRows}
                columns={[
                  { key: 'ad', label: 'Anúncio' },
                  { key: 'leads', label: 'Leads', numeric: true },
                  ...classes.map((c) => ({ key: classKey(c), label: classPlural(c), numeric: true, format: (x: unknown) => fmtInt(Number(x) || 0) })),
                  { key: 'agendados', label: v.fechados, numeric: true },
                  { key: 'vendas', label: 'Vendas', numeric: true },
                ]}
                emptyText={
                  columns.ad
                    ? 'Nenhum lead com anúncio preenchido no período selecionado.'
                    : 'Nenhum anúncio identificado: adicione a coluna Anúncio na planilha (de qual anúncio cada lead veio) ou use a mensagem padrão do anúncio no WhatsApp.'
                }
                legend={metric.id === 'leads' && stack ? <Legend items={stack} mark="rect" /> : undefined}
                actions={
                  <label className="control sm" title="Ordenar os anúncios pela métrica">
                    <select aria-label="Ordenar anúncios por" value={metric.id} onChange={(e) => setAdMetric(e.target.value)}>
                      {metrics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              >
                {metric.id === 'leads' && stack ? (
                  <StackedHBars data={adTop} nameKey="name" series={stack} totalKey="leads" palette={palette} labelWidth={260} />
                ) : (
                  <HBars data={adTop.map((r) => ({ name: r.name, value: adValue(r, metric.id) }))} label={metric.short} palette={palette} labelWidth={260} />
                )}
                {metric.id === 'vendas' && totalSales === 0 && (
                  <div className="callout" style={{ marginTop: 8 }}>
                    Nenhuma venda registrada no período. Marque as conversas que viraram venda com o status <b>Convertido</b> (na aba Conversas ou na coluna status_manual da
                    planilha) para o ranking de vendas funcionar.
                  </div>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>
                  {adRows.length > AD_TOP ? `${AD_TOP} de ${fmtInt(adRows.length)} anúncios no gráfico (a tabela tem todos). ` : ''}
                  {noAd > 0 ? `${fmtInt(noAd)} ${noAd === 1 ? 'lead sem anúncio identificado' : 'leads sem anúncio identificado'}. ` : ''}
                  {closedRule(v)}
                </p>
              </ChartCard>
            </div>
          )}

          {show('mensagens-dia') && (
            <div className="span-2">
              <ChartCard
                title="Mensagens por dia"
                subtitle={`Volume diário de mensagens recebidas dos leads e enviadas pela ${v.empresa}`}
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
              title="Classificação dos leads"
              subtitle={`Conforme a coluna ${columns.classification ? `“${columns.classification}”` : 'Classificação'} da planilha`}
              rows={classRows}
              columns={[
                { key: 'name', label: 'Classificação' },
                { key: 'value', label: 'Leads', numeric: true },
              ]}
              emptyText={
                columns.classification
                  ? 'Nenhum lead com classificação preenchida no período selecionado.'
                  : 'A planilha não tem a coluna Classificação. Adicione uma coluna com esse nome (ex.: frio, morno, quente).'
              }
            >
              <HBars data={classRows} label="Leads" palette={palette} colors={classBarColors(palette, classes, classRows.map((r) => r.name))} />
            </ChartCard>
          )}

          {show('procedimentos') && (
            <ChartCard
              title={`${v.Itens} de interesse`}
              subtitle="Identificado pela mensagem inicial do anúncio ou por palavras-chave do lead"
              rows={byProcedure}
              columns={[
                { key: 'name', label: v.Item },
                { key: 'value', label: 'Leads', numeric: true },
              ]}
            >
              <HBars data={byProcedure} label="Leads" palette={palette} />
            </ChartCard>
          )}

          {show('estagio') && (
            <ChartCard
              title="Estágio inferido das conversas"
              subtitle="Inferido automaticamente pelo conteúdo das mensagens"
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
              subtitle="Status dado pela equipe na aba Conversas"
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
                  <h3 className="card-title">Leads aguardando resposta da {v.empresa}</h3>
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
                        <th>{v.Item}</th>
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
