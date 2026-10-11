import { useMemo } from 'react'
import { BadgeDollarSign, CalendarCheck, MessageCircleReply, Reply, Timer, Wallet } from 'lucide-react'
import type { Conversation, Message } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { Palette } from '../theme'
import {
  awaitingList,
  coldList,
  countBy,
  funnel,
  heatmapReceived,
  hourProfile,
  leadConversations,
  median,
  responseBuckets,
  scheduleRateBy,
  shareWithin,
  stageCount,
} from '../lib/analytics'
import { WEEKDAYS_LONG, fmtHours, fmtInt, fmtMinutes, fmtPct } from '../lib/format'
import { STAGE_LABEL } from '../lib/status'
import type { InsightId } from '../lib/insights'
import { StatTile } from '../components/StatTile'
import { ChartCard } from '../components/ChartCard'
import { Legend } from '../components/ChartTooltip'
import { FunnelBars } from '../components/charts/FunnelBars'
import { ColumnBars } from '../components/charts/ColumnBars'
import { HBars } from '../components/charts/HBars'
import { HourHeatmap } from '../components/charts/HourHeatmap'
import { TwoSeriesLine } from '../components/charts/TwoSeriesLine'
import { StageBadge, StatusBadge } from '../components/StatusBadge'

interface Props {
  convs: Conversation[]
  msgs: Message[]
  meta: MetaMap
  palette: Palette
  /** Blocos que esta pessoa vê (o administrador escolhe por usuário na aba Usuários). */
  visible: Set<InsightId>
  onOpenConv: (key: string) => void
}

export function InsightsView({ convs, msgs, meta, palette, visible, onOpenConv }: Props) {
  const show = (id: InsightId) => visible.has(id)
  const leads = useMemo(() => leadConversations(convs, meta), [convs, meta])
  const wrote = leads.filter((c) => c.received > 0)
  const replied = wrote.filter((c) => c.sent > 0)
  const firstTimes = leads.map((c) => c.firstResponseMin).filter((v): v is number => v != null)
  const steps = useMemo(() => funnel(leads), [leads])
  const buckets = useMemo(() => responseBuckets(firstTimes), [firstTimes])
  const heat = useMemo(() => heatmapReceived(msgs), [msgs])
  const hours = useMemo(() => hourProfile(msgs), [msgs])
  const rateByProc = useMemo(
    () => scheduleRateBy(leads, meta, (c) => c.procedure).map((r) => ({ name: r.name, value: r.rate, total: r.total, hits: r.hits })),
    [leads, meta],
  )
  const byChannel = useMemo(() => countBy(leads, (c) => c.channel), [leads])
  const awaiting = useMemo(() => awaitingList(leads), [leads])
  const cold = useMemo(() => coldList(leads, meta), [leads, meta])
  const asked = useMemo(
    () =>
      [
        { name: 'Perguntaram valor / preço', value: wrote.filter((c) => c.askedPrice).length },
        { name: 'Pediram agendamento', value: wrote.filter((c) => c.askedSchedule).length },
        { name: 'Pediram endereço', value: wrote.filter((c) => c.askedAddress).length },
        { name: 'Só mídia ou saudação', value: wrote.filter((c) => c.messages.filter((m) => m.direction === 'Recebida').every((m) => m.isMedia || m.text.length < 12)).length },
      ].filter((r) => r.value > 0),
    [wrote],
  )

  const responseRate = wrote.length ? replied.length / wrote.length : NaN
  const within15 = shareWithin(firstTimes, 15)
  const askedScheduleShare = wrote.length ? wrote.filter((c) => c.askedSchedule).length / wrote.length : NaN
  const askedPriceShare = wrote.length ? wrote.filter((c) => c.askedPrice).length / wrote.length : NaN
  const paid = stageCount(leads, 'pagamento')
  const scheduledOrPaid = steps[steps.length - 1]?.count ?? 0

  // destaques automáticos
  const heatFlat = heat.flatMap((row, d) => row.map((v, h) => ({ d, h, v })))
  const peak = heatFlat.reduce((a, b) => (b.v > a.v ? b : a), { d: 0, h: 0, v: 0 })
  const topProc = countBy(wrote, (c) => c.procedure, 20)[0]
  const dayTotals = heat.map((row, d) => ({ name: WEEKDAYS_LONG[d], value: row.reduce((a, b) => a + b, 0), peak: row.indexOf(Math.max(...row)) }))
  const highlights: string[] = []
  if (topProc && wrote.length) highlights.push(`${topProc.name} concentra ${fmtPct(topProc.value / wrote.length)} dos leads que escreveram.`)
  if (peak.v > 0) highlights.push(`Pico de demanda: ${WEEKDAYS_LONG[peak.d]} às ${peak.h}h, com ${fmtInt(peak.v)} mensagens recebidas no período.`)
  if (Number.isFinite(responseRate)) highlights.push(`${fmtPct(responseRate)} dos leads receberam resposta; mediana da primeira resposta de ${fmtMinutes(median(firstTimes))}.`)
  if (Number.isFinite(askedPriceShare)) highlights.push(`${fmtPct(askedPriceShare)} perguntaram valor e ${fmtPct(askedScheduleShare)} pediram agendamento ou avaliação.`)
  if (awaiting.length) highlights.push(`${fmtInt(awaiting.length)} leads estão com a última mensagem sem resposta da clínica.`)

  const hourSeries = [
    { key: 'recebidas', label: 'Recebidas (leads)', color: palette.series1 },
    { key: 'enviadas', label: 'Enviadas (clínica)', color: palette.series2 },
  ]

  return (
    <>
      {show('destaques') && highlights.length > 0 && (
        <div className="callout">
          <b>Destaques do período</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {show('indicadores') && (
        <div className="grid grid-kpi">
          <StatTile icon={<Reply size={14} />} label="Taxa de resposta da clínica" value={fmtPct(responseRate)} hint={`${fmtInt(wrote.length - replied.length)} leads nunca receberam resposta`} tone={wrote.length - replied.length > 0 ? 'bad' : 'good'} />
          <StatTile icon={<Timer size={14} />} label="Mediana da 1ª resposta" value={fmtMinutes(median(firstTimes))} hint={Number.isFinite(within15) ? `${fmtPct(within15)} em até 15 min` : '—'} tone={within15 >= 0.5 ? 'good' : undefined} />
          <StatTile icon={<MessageCircleReply size={14} />} label="Leads que engajaram" value={fmtPct(wrote.length ? (steps[2]?.count ?? 0) / wrote.length : NaN)} hint="voltaram a escrever após a resposta" />
          <StatTile icon={<CalendarCheck size={14} />} label="Pediram agendamento" value={fmtPct(askedScheduleShare)} hint={`${fmtInt(wrote.filter((c) => c.askedSchedule).length)} leads`} />
          <StatTile icon={<BadgeDollarSign size={14} />} label="Perguntaram valor" value={fmtPct(askedPriceShare)} hint={`${fmtInt(wrote.filter((c) => c.askedPrice).length)} leads`} />
          <StatTile icon={<Wallet size={14} />} label="Agendamento ou pagamento" value={fmtInt(scheduledOrPaid)} hint={`${fmtInt(paid)} com pagamento sinalizado`} tone={paid ? 'good' : undefined} />
        </div>
      )}

      <div className="grid grid-2 blocks-grid">
        {show('funil') && (
          <ChartCard
            title="Funil inferido das conversas"
            subtitle="Etapas detectadas pelo conteúdo das mensagens; o status manual não altera este funil"
            rows={steps}
            columns={[
              { key: 'label', label: 'Etapa' },
              { key: 'count', label: 'Leads', numeric: true },
              { key: 'hint', label: 'Critério' },
            ]}
          >
            <FunnelBars steps={steps} palette={palette} />
          </ChartCard>
        )}

        {show('tempo-resposta') && (
          <ChartCard
            title="Tempo até a primeira resposta"
            subtitle="Distribuição do intervalo entre a 1ª mensagem do lead e a 1ª resposta da clínica"
            rows={buckets}
            columns={[
              { key: 'label', label: 'Faixa' },
              { key: 'count', label: 'Conversas', numeric: true },
            ]}
          >
            <ColumnBars data={buckets} xKey="label" yKey="count" label="Conversas" palette={palette} directLabels height={260} />
          </ChartCard>
        )}

        {show('mapa-calor') && (
          <div className="span-2">
            <ChartCard
              title="Quando os leads escrevem"
              subtitle="Mensagens recebidas por dia da semana e hora do dia"
              rows={dayTotals}
              columns={[
                { key: 'name', label: 'Dia' },
                { key: 'value', label: 'Recebidas', numeric: true },
                { key: 'peak', label: 'Hora de pico', format: (v) => `${String(v)}h` },
              ]}
            >
              <HourHeatmap grid={heat} palette={palette} />
            </ChartCard>
          </div>
        )}

        {show('perfil-horario') && (
          <ChartCard
            title="Perfil horário das mensagens"
            subtitle="Total por hora do dia no período"
            rows={hours}
            columns={[
              { key: 'label', label: 'Hora' },
              { key: 'recebidas', label: 'Recebidas', numeric: true },
              { key: 'enviadas', label: 'Enviadas', numeric: true },
            ]}
            legend={<Legend items={hourSeries} />}
          >
            <TwoSeriesLine data={hours} xKey="label" series={hourSeries} palette={palette} height={240} />
          </ChartCard>
        )}

        {show('pedidos') && (
          <ChartCard
            title="O que os leads pedem"
            subtitle="Leads que escreveram, por tipo de pedido detectado nas mensagens"
            rows={asked}
            columns={[
              { key: 'name', label: 'Pedido' },
              { key: 'value', label: 'Leads', numeric: true },
            ]}
          >
            <HBars data={asked} label="Leads" palette={palette} labelWidth={210} />
          </ChartCard>
        )}

        {show('agendamento-procedimento') && (
          <ChartCard
            title="Taxa de agendamento por procedimento"
            subtitle="Leads com agendamento/pagamento sinalizado ou status Agendado/Convertido (mínimo de 5 leads)"
            rows={rateByProc}
            columns={[
              { key: 'name', label: 'Procedimento' },
              { key: 'total', label: 'Leads', numeric: true },
              { key: 'hits', label: 'Agendaram', numeric: true },
              { key: 'value', label: 'Taxa', numeric: true, format: (v) => fmtPct(Number(v)) },
            ]}
            emptyText="Ainda não há procedimentos com pelo menos 5 leads no período."
          >
            <HBars
              data={rateByProc}
              label="Taxa de agendamento"
              palette={palette}
              format={(v, row) => (row ? `${fmtPct(v)} (${fmtInt(Number(row.hits))} de ${fmtInt(Number(row.total))})` : fmtPct(v))}
            />
          </ChartCard>
        )}

        {show('canal') && (
          <ChartCard
            title="Canal de origem"
            subtitle="Anúncio = mensagem padrão do CTA; Instagram = lead citou a rede; Prospecção = clínica iniciou"
            rows={byChannel}
            columns={[
              { key: 'name', label: 'Canal' },
              { key: 'value', label: 'Leads', numeric: true },
            ]}
          >
            <HBars data={byChannel} label="Leads" palette={palette} />
          </ChartCard>
        )}

        {show('aguardando') && (
          <section className="card" aria-label="Aguardando resposta">
            <div className="card-head">
              <div>
                <h3 className="card-title">Aguardando resposta da clínica</h3>
                <p className="card-sub">Última mensagem foi do lead · {fmtInt(awaiting.length)} conversas</p>
              </div>
            </div>
            <LeadTable rows={awaiting.slice(0, 15)} meta={meta} onOpen={onOpenConv} timeLabel="Esperando há" time={(c) => fmtHours(c.awaitingHours)} empty="Nenhum lead aguardando resposta." />
          </section>
        )}

        {show('esfriando') && (
          <section className="card" aria-label="Leads esfriando">
            <div className="card-head">
              <div>
                <h3 className="card-title">Leads esfriando</h3>
                <p className="card-sub">Engajaram ou pediram agendamento, a clínica respondeu e há mais de 48h sem retorno · {fmtInt(cold.length)}</p>
              </div>
            </div>
            <LeadTable rows={cold.slice(0, 15)} meta={meta} onOpen={onOpenConv} timeLabel="Em silêncio há" time={(c) => fmtHours(c.silentHours)} empty="Nenhum lead esfriando. Bom sinal." />
          </section>
        )}
      </div>
    </>
  )
}

function LeadTable({
  rows,
  meta,
  onOpen,
  timeLabel,
  time,
  empty,
}: {
  rows: Conversation[]
  meta: MetaMap
  onOpen: (key: string) => void
  timeLabel: string
  time: (c: Conversation) => string
  empty: string
}) {
  if (rows.length === 0) return <div className="empty">{empty}</div>
  return (
    <div className="table-scroll" style={{ maxHeight: 420 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Procedimento</th>
            <th>Estágio</th>
            <th className="num">{timeLabel}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.key} className="clickable" onClick={() => onOpen(c.key)} title={`Abrir conversa · ${STAGE_LABEL[c.stage]}`}>
              <td className="truncate narrow">{c.name}</td>
              <td className="truncate narrow">{c.procedure}</td>
              <td>
                <StageBadge small stage={c.stage} />
              </td>
              <td className="num">{time(c)}</td>
              <td>
                <StatusBadge small status={meta[c.key]?.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
