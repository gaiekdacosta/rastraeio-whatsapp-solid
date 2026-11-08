import { useEffect, useMemo } from 'react'
import { Printer, X } from 'lucide-react'
import type { Conversation, Message } from '../lib/types'
import type { MetaMap } from '../lib/storage'
import type { Palette } from '../theme'
import { useTheme } from '../theme'
import {
  adSummary,
  awaitingList,
  countBy,
  funnel,
  isSale,
  leadConversations,
  median,
  messagesPerDay,
  newLeadsPerWeek,
  rankAds,
  shareWithin,
  classificationCounts,
  adValue,
} from '../lib/analytics'
import { fmtDateKey, fmtDateTime, fmtInt, fmtMinutes, fmtPct, fromDateKey, toDateKey } from '../lib/format'
import { classKey, classPlural } from '../lib/classification'
import { cap } from '../lib/segment'
import type { OverviewId } from '../lib/overview'
import type { InsightId } from '../lib/insights'
import { SolidMark } from '../components/BrandLogo'
import { Legend } from '../components/ChartTooltip'
import { TwoSeriesLine } from '../components/charts/TwoSeriesLine'
import { ColumnBars } from '../components/charts/ColumnBars'
import { HBars } from '../components/charts/HBars'
import { FunnelBars } from '../components/charts/FunnelBars'
import { StackedHBars } from '../components/charts/StackedHBars'
import { classBarColors, classKpi, classSeries, closedRule } from './OverviewView'
import { adHighlight, classHighlight } from './InsightsView'
import { useVocab } from '../vocab'

interface Props {
  convs: Conversation[]
  msgs: Message[]
  range: { from: string; to: string }
  meta: MetaMap
  palette: Palette
  /** Para quem é o relatório: empresa do usuário, cliente escolhido ou "Todos os clientes". */
  client: string
  /** Filtros ativos além do período, um por linha (ex.: "Número: Loja Centro"). */
  scope: string[]
  /** Última mensagem da base: até quando os dados vão. */
  refTime: Date
  /** Classificações da base inteira, na ordem (e com as cores) do painel. */
  classes: string[]
  /** Blocos que a pessoa vê no painel; o relatório segue a mesma escolha. */
  overview: Set<OverviewId>
  insights: Set<InsightId>
  onClose: () => void
}

const AD_TOP = 10

/** Relatório imprimível com as métricas principais do período. O botão usa a impressão do navegador ("Salvar como PDF"). */
export function ReportView({ convs, msgs, range, meta, palette, client, scope, refTime, classes, overview, insights, onClose }: Props) {
  const { setOverride } = useTheme()
  const v = useVocab()

  // O relatório é sempre claro (vai para o papel/PDF); ao fechar, volta ao tema da pessoa.
  useEffect(() => {
    setOverride('light')
    return () => setOverride(null)
  }, [setOverride])

  const period = `${fmtDateKey(range.from)} a ${fmtDateKey(range.to)}`
  useEffect(() => {
    const previous = document.title
    document.title = `Relatório WhatsApp – ${client} – ${period}`
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.title = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [client, period, onClose])

  const leads = useMemo(() => leadConversations(convs, meta), [convs, meta])
  const newLeads = leads.filter((c) => {
    const k = toDateKey(c.firstAt)
    return k >= range.from && k <= range.to
  })
  const wrote = leads.filter((c) => c.received > 0)
  const replied = wrote.filter((c) => c.sent > 0)
  const received = msgs.filter((m) => m.direction === 'Recebida').length
  const sent = msgs.length - received
  const days = Math.max(1, Math.round((fromDateKey(range.to).getTime() - fromDateKey(range.from).getTime()) / 86400000) + 1)
  const firstTimes = leads.map((c) => c.firstResponseMin).filter((v): v is number => v != null)
  const firstResp = median(firstTimes)
  const within15 = shareWithin(firstTimes, 15)
  const responseRate = wrote.length ? replied.length / wrote.length : NaN
  const awaiting = awaitingList(leads)
  const steps = useMemo(() => funnel(leads, v), [leads, v])
  const scheduledOrPaid = steps[steps.length - 1]?.count ?? 0
  const sales = leads.filter((c) => isSale(c, meta)).length
  const hasClassification = leads.some((c) => c.classification)
  const kpiClass = classKpi(leads, classes)
  const classRows = useMemo(() => (hasClassification ? classificationCounts(leads, classes) : []), [hasClassification, leads, classes])
  // Na tabela de anúncios, só as classificações que aparecem no recorte (a tabela do PDF não rola de lado).
  const tableClasses = classes.filter((c) => leads.some((l) => l.classification === c))
  const perDay = useMemo(() => messagesPerDay(msgs, range), [msgs, range])
  const perWeek = useMemo(() => newLeadsPerWeek(leads, range), [leads, range])
  const byProcedure = useMemo(() => countBy(leads, (c) => c.procedure, 8), [leads])
  const byChannel = useMemo(() => countBy(leads, (c) => c.channel), [leads])
  const ads = useMemo(() => rankAds(adSummary(leads, meta), 'leads'), [leads, meta])
  const adTop = ads.slice(0, AD_TOP).map((r) => ({ ...r, name: r.ad }))
  const stack = hasClassification ? classSeries(palette, classes) : null

  const highlights: string[] = []
  if (leads.length) highlights.push(`${fmtInt(leads.length)} conversas de leads no período, ${fmtInt(newLeads.length)} delas iniciadas nele (${fmtInt((newLeads.length / days) * 7)} por semana).`)
  if (Number.isFinite(responseRate)) highlights.push(`${fmtPct(responseRate)} dos leads receberam resposta; mediana da primeira resposta de ${fmtMinutes(firstResp)}${Number.isFinite(within15) ? `, ${fmtPct(within15)} em até 15 minutos` : ''}.`)
  const topItem = byProcedure.find((r) => r.name !== 'Não identificado' && r.name !== 'Outros')
  if (topItem && wrote.length) highlights.push(`${topItem.name} concentra ${fmtPct(topItem.value / leads.length)} dos leads.`)
  const classLine = hasClassification ? classHighlight(leads, classes) : null
  if (classLine) highlights.push(classLine)
  if (ads[0]) highlights.push(adHighlight(ads, hasClassification ? classes : []))
  if (scheduledOrPaid) highlights.push(`${fmtInt(scheduledOrPaid)} leads com ${v.fechamento} ou pagamento sinalizado${sales ? `, ${fmtInt(sales)} vendas` : ''}.`)
  if (awaiting.length) highlights.push(`${fmtInt(awaiting.length)} leads estão aguardando resposta.`)

  const daySeries = [
    { key: 'recebidas', label: 'Recebidas (leads)', color: palette.series1 },
    { key: 'enviadas', label: `Enviadas (${v.empresa})`, color: palette.series2 },
  ]

  const ov = (id: OverviewId) => overview.has(id)
  const ins = (id: InsightId) => insights.has(id)
  const showAds = ov('anuncios') && ads.length > 0
  const showClass = ov('temperatura') && hasClassification

  const kpis: { label: string; value: string; hint?: string }[] = []
  if (ov('leads')) kpis.push({ label: 'Conversas de leads', value: fmtInt(leads.length) })
  if (ov('novos-leads')) kpis.push({ label: 'Novos leads no período', value: fmtInt(newLeads.length), hint: `${fmtInt((newLeads.length / days) * 7)} por semana` })
  if (ov('recebidas')) kpis.push({ label: 'Mensagens recebidas', value: fmtInt(received), hint: `${fmtInt(received / days)} por dia` })
  if (ov('enviadas')) kpis.push({ label: 'Mensagens enviadas', value: fmtInt(sent) })
  if (ins('indicadores')) kpis.push({ label: 'Taxa de resposta', value: fmtPct(responseRate), hint: `${fmtInt(wrote.length - replied.length)} sem resposta` })
  if (ov('primeira-resposta')) kpis.push({ label: 'Mediana da 1ª resposta', value: fmtMinutes(firstResp), hint: Number.isFinite(within15) ? `${fmtPct(within15)} em até 15 min` : undefined })
  if (ov('aguardando-resposta')) kpis.push({ label: 'Aguardando resposta', value: fmtInt(awaiting.length) })
  if (ins('indicadores') || ins('funil'))
    kpis.push({ label: `${cap(v.fechamento)} ou pagamento`, value: fmtInt(scheduledOrPaid), hint: sales ? `${fmtInt(sales)} vendas` : undefined })
  if (ov('leads-quentes') && hasClassification) kpis.push({ label: kpiClass.title, value: fmtInt(kpiClass.value), hint: kpiClass.hint })

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Relatório em PDF">
      <div className="report-toolbar no-print">
        <button type="button" className="btn ghost sm" onClick={onClose}>
          <X size={14} aria-hidden /> Fechar
        </button>
        <span className="report-toolbar-title">Relatório · {client} · {period}</span>
        <span className="spacer" />
        <span className="small muted">Na janela de impressão, escolha “Salvar como PDF”.</span>
        <button type="button" className="btn primary sm" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Salvar PDF
        </button>
      </div>

      <article className="report">
        <header className="report-head">
          <div className="report-brand">
            <SolidMark size={28} />
            <div>
              <div className="report-brand-name">Solid Marketing Digital</div>
              <div className="report-brand-sub">Rastreio WhatsApp</div>
            </div>
          </div>
          <h1>Relatório de atendimento no WhatsApp</h1>
          <div className="report-meta">
            <div>
              <span>Cliente</span>
              <b>{client}</b>
            </div>
            <div>
              <span>Período</span>
              <b>{period}</b>
            </div>
            <div>
              <span>Dados até</span>
              <b>{fmtDateTime(refTime)}</b>
            </div>
            <div>
              <span>Gerado em</span>
              <b>{fmtDateTime(new Date())}</b>
            </div>
          </div>
          {scope.length > 0 && <p className="report-scope">Recorte: {scope.join(' · ')}</p>}
        </header>

        {kpis.length > 0 && (
          <section className="report-kpis" aria-label="Indicadores">
            {kpis.map((k) => (
              <div className="report-kpi" key={k.label}>
                <div className="label">{k.label}</div>
                <div className="value">{k.value}</div>
                {k.hint && <div className="hint">{k.hint}</div>}
              </div>
            ))}
          </section>
        )}

        {ins('destaques') && highlights.length > 0 && (
          <section className="report-block wide" aria-label="Destaques">
            <h3>Destaques do período</h3>
            <ul className="report-highlights">
              {highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="report-grid">
          {ov('leads-semana') && (
            <section className="report-block">
              <h3>Novos leads por semana</h3>
              <p className="sub">Conversas cuja primeira mensagem ocorreu na semana</p>
              <ColumnBars data={perWeek} xKey="label" yKey="leads" label="Novos leads" palette={palette} directLabels height={200} titleFormatter={(l) => `Semana de ${String(l)}`} />
            </section>
          )}
          {ov('procedimentos') && byProcedure.length > 0 && (
            <section className="report-block">
              <h3>{v.Itens} de interesse</h3>
              <p className="sub">Pela mensagem inicial do anúncio ou por palavras-chave do lead</p>
              <HBars data={byProcedure} label="Leads" palette={palette} rowHeight={26} />
            </section>
          )}
          {ov('mensagens-dia') && (
            <section className="report-block wide">
              <h3>Mensagens por dia</h3>
              <p className="sub">Recebidas dos leads e enviadas pela {v.empresa}</p>
              <Legend items={daySeries} />
              <TwoSeriesLine data={perDay} xKey="label" series={daySeries} palette={palette} height={200} titleFormatter={(_l, row) => (row ? fmtDateKey(String(row.date)) : '')} />
            </section>
          )}
          {showClass && (
            <section className="report-block">
              <h3>Classificação dos leads</h3>
              <p className="sub">Conforme a coluna Classificação da planilha</p>
              <HBars data={classRows} label="Leads" palette={palette} colors={classBarColors(palette, classes, classRows.map((r) => r.name))} rowHeight={28} labelWidth={120} />
            </section>
          )}
          {ins('canal') && byChannel.length > 0 && (
            <section className="report-block">
              <h3>Canal de origem</h3>
              <p className="sub">Anúncio, Instagram, prospecção ativa ou orgânico</p>
              <HBars data={byChannel} label="Leads" palette={palette} rowHeight={28} labelWidth={130} />
            </section>
          )}
          {ins('funil') && wrote.length > 0 && (
            <section className="report-block wide">
              <h3>Funil inferido das conversas</h3>
              <p className="sub">Etapas detectadas pelo conteúdo das mensagens</p>
              <FunnelBars steps={steps} palette={palette} />
            </section>
          )}
          {showAds && (
            <section className="report-block wide">
              <h3>Anúncios</h3>
              <p className="sub">
                Leads por anúncio de origem{stack ? ', divididos por classificação' : ''}
                {ads.length > AD_TOP ? ` (${AD_TOP} maiores no gráfico; a tabela tem todos)` : ''}
              </p>
              {stack ? (
                <>
                  <Legend items={stack} mark="rect" />
                  <StackedHBars data={adTop} nameKey="name" series={stack} totalKey="leads" palette={palette} labelWidth={240} rowHeight={28} />
                </>
              ) : (
                <HBars data={adTop.map((r) => ({ name: r.name, value: r.leads }))} label="Leads" palette={palette} labelWidth={240} rowHeight={28} />
              )}
              <table className="table report-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th className="num">Leads</th>
                    {tableClasses.map((c) => (
                      <th key={c} className="num">
                        {classPlural(c)}
                      </th>
                    ))}
                    <th className="num">{v.fechados}</th>
                    <th className="num">Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((r) => (
                    <tr key={r.ad}>
                      <td>{r.ad}</td>
                      <td className="num">{fmtInt(r.leads)}</td>
                      {tableClasses.map((c) => (
                        <td key={c} className="num">
                          {fmtInt(adValue(r, classKey(c)))}
                        </td>
                      ))}
                      <td className="num">{fmtInt(r.agendados)}</td>
                      <td className="num">{fmtInt(r.vendas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <footer className="report-foot">
          <span>Solid Marketing Digital · Rastreio WhatsApp</span>
          <span>
            {closedRule(v)} Tempos em relação à última mensagem da planilha.
          </span>
        </footer>
      </article>
    </div>
  )
}
