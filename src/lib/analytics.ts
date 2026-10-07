import type { Channel, Conversation, Filters, Message, Stage, Status } from './types'
import type { MetaMap } from './storage'
import { FINAL_STATUSES } from './status'
import { fmtShortDate, fromDateKey, isoWeekKey, toDateKey } from './format'

/* ------------------------------------------------------------------ */
/* Heurísticas de texto                                                */
/* ------------------------------------------------------------------ */

const PROCEDURES: { name: string; re: RegExp }[] = [
  { name: 'Facetas de Resina', re: /faceta|lentes? de contato|lentes? dent/i },
  { name: 'Preenchimento Labial', re: /preench\w* labial|labial|l[áa]bios?\b/i },
  { name: 'Full Face', re: /full ?face/i },
  { name: 'Método Reviva', re: /reviva/i },
  { name: 'Perfiloplastia', re: /perfilo/i },
  { name: 'Toxina / Botox', re: /botox|toxina/i },
  { name: 'Bioestimulador', re: /bioestim|sculptra|radiesse/i },
  { name: 'Rinomodelação', re: /rinomodel|\brino\b/i },
  { name: 'Harmonização facial', re: /harmoniza/i },
  { name: 'Clareamento', re: /clarea/i },
  { name: 'Lipo de papada', re: /papada|\blipo\b/i },
  { name: 'Olheiras', re: /olheira/i },
  { name: 'Limpeza de pele', re: /limpeza de pele/i },
  { name: 'Preenchimento', re: /preench/i },
]

const CTA_RE = /tenho interesse (?:n[oa]s?|em|no m[ée]todo)\s+(.+?)\s*[!.?]/i
const INSTAGRAM_RE = /instagram|\binsta\b|vim do (?:story|stories|reels|perfil)/i
const PRICE_RE = /\bvalor(?:es)?\b|pre[çc]o|quanto (?:custa|fica|[ée]|t[áa]|sai)|\bcusta\b|or[çc]amento|parcel|\bpix\b/i
const SCHEDULE_RE = /agend|avalia[çc][ãa]o|\bavaliar\b|marcar|hor[áa]rio|dispon[ií]/i
const ADDRESS_RE = /endere[çc]o|onde fica|localiza|fica onde|\blocal\b/i
const PAYMENT_RE = /\bpix\b|comprovante|pagamento|sinal (?:de|para|do)|\bpagou\b|\bpago\b|\bpaga\b|checkout/i
const CONFIRMED_RE =
  /agendad|confirmad[oa]|marcad[oa]|sua (?:consulta|avalia[çc][ãa]o) (?:est[áa]|fica|ser[áa])|te espero|esperamos voc[êe]|at[ée] (?:l[áa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|amanh[ãa])|hor[áa]rio (?:confirmado|reservado)/i

function canonicalProcedure(text: string): string | null {
  for (const p of PROCEDURES) if (p.re.test(text)) return p.name
  return null
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function inferProcedure(firstReceived: Message | null, received: Message[], sent: Message[]): string {
  if (firstReceived) {
    const m = firstReceived.text.match(CTA_RE)
    if (m) {
      const captured = m[1].trim()
      return canonicalProcedure(captured) ?? titleCase(captured)
    }
  }
  for (const msg of received) {
    if (msg.isMedia) continue
    const p = canonicalProcedure(msg.text)
    if (p) return p
  }
  // Fallback: o que a clínica explicou ao lead costuma nomear o procedimento.
  for (const msg of sent) {
    if (msg.isMedia) continue
    const p = canonicalProcedure(msg.text)
    if (p) return p
  }
  return 'Não identificado'
}

function inferChannel(firstReceived: Message | null, received: Message[], startedBy: 'Recebida' | 'Enviada'): Channel {
  if (firstReceived && CTA_RE.test(firstReceived.text)) return 'Anúncio (CTA)'
  if (received.some((m) => INSTAGRAM_RE.test(m.text))) return 'Instagram'
  if (startedBy === 'Enviada') return 'Prospecção ativa'
  return 'Orgânico / outro'
}

function inferStage(msgs: Message[], received: Message[], sent: Message[]): Stage {
  if (sent.length === 0) return 'sem_resposta_clinica'
  if (received.length === 0) return 'sem_retorno_lead'
  if (msgs.some((m) => PAYMENT_RE.test(m.text))) return 'pagamento'
  if (sent.some((m) => CONFIRMED_RE.test(m.text))) return 'agendamento'
  if (received.some((m) => SCHEDULE_RE.test(m.text))) return 'pediu_agendamento'
  let seenSent = false
  for (const m of msgs) {
    if (m.direction === 'Enviada') seenSent = true
    else if (seenSent) return 'engajado'
  }
  return 'contato'
}

export function isGroupId(phone: string): boolean {
  return /^\d{17,}$/.test(phone) || phone.startsWith('120363')
}

/* ------------------------------------------------------------------ */
/* Construção das conversas                                            */
/* ------------------------------------------------------------------ */

export function referenceTime(messages: Message[]): Date {
  let max = 0
  for (const m of messages) if (m.at.getTime() > max) max = m.at.getTime()
  return max ? new Date(max) : new Date()
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/* ------------------------------------------------------------------ */
/* Números da empresa                                                  */
/* ------------------------------------------------------------------ */

export const LINE_NONE = 'none'

/**
 * Número da empresa que atendeu a conversa: o que mais enviou mensagens (empate → o que enviou por último).
 * A planilha não diz para qual número uma mensagem recebida foi, então conversa sem resposta só tem número
 * conhecido quando a base tem um número só.
 */
function conversationLines(sent: Message[], clinicPhones: string[]): { line: string; lines: string[] } {
  const count = new Map<string, { n: number; last: number }>()
  for (const m of sent) {
    const e = count.get(m.phone) ?? { n: 0, last: 0 }
    e.n++
    e.last = m.at.getTime()
    count.set(m.phone, e)
  }
  const lines = [...count.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(([p]) => p)
  return { line: lines[0] ?? (clinicPhones.length === 1 ? clinicPhones[0] : ''), lines }
}

/** Nomes que aparecem na coluna Lead das mensagens enviadas por cada número, do mais ao menos frequente. */
export function attendantsByLine(messages: Message[]): Map<string, string[]> {
  const map = new Map<string, Map<string, number>>()
  for (const m of messages) {
    if (m.direction !== 'Enviada' || !m.lead) continue
    const names = map.get(m.phone) ?? new Map<string, number>()
    names.set(m.lead, (names.get(m.lead) ?? 0) + 1)
    map.set(m.phone, names)
  }
  const out = new Map<string, string[]>()
  map.forEach((names, line) => out.set(line, [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)))
  return out
}

export function buildConversations(messages: Message[], refTime: Date, clinicPhones: string[] = []): Conversation[] {
  const groups = new Map<string, Message[]>()
  for (const m of messages) {
    const key = m.convKey || m.phone
    const arr = groups.get(key)
    if (arr) arr.push(m)
    else groups.set(key, [m])
  }

  const convs: Conversation[] = []
  groups.forEach((msgs, key) => {
    msgs.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id)
    const received = msgs.filter((m) => m.direction === 'Recebida')
    const sent = msgs.filter((m) => m.direction === 'Enviada')

    const nameCount = new Map<string, number>()
    for (const m of received) {
      const n = m.lead.trim()
      if (!n || n === '.') continue
      nameCount.set(n, (nameCount.get(n) ?? 0) + 1)
    }
    let name = ''
    let best = -1
    nameCount.forEach((n, k) => {
      if (n > best) {
        best = n
        name = k
      }
    })
    const isGroup = isGroupId(key)
    if (!name) name = isGroup ? 'Grupo' : 'Sem nome'

    const responseTimes: number[] = []
    let pending: Date | null = null
    for (const m of msgs) {
      if (m.direction === 'Recebida') {
        if (pending === null) pending = m.at
      } else if (pending !== null) {
        responseTimes.push((m.at.getTime() - pending.getTime()) / 60000)
        pending = null
      }
    }

    const last = msgs[msgs.length - 1]
    const hoursSinceLast = (refTime.getTime() - last.at.getTime()) / 3600000
    const firstReceived = received[0] ?? null
    const startedBy = msgs[0].direction

    const csvStatusCount = new Map<string, number>()
    for (const m of msgs) if (m.statusManual) csvStatusCount.set(m.statusManual, (csvStatusCount.get(m.statusManual) ?? 0) + 1)
    let csvStatus = ''
    let csvBest = -1
    csvStatusCount.forEach((n, k) => {
      if (n > csvBest) {
        csvBest = n
        csvStatus = k
      }
    })

    convs.push({
      key,
      phone: key,
      name,
      isGroup,
      isInternal: clinicPhones.includes(key),
      ...conversationLines(sent, clinicPhones),
      messages: msgs,
      firstAt: msgs[0].at,
      lastAt: last.at,
      received: received.length,
      sent: sent.length,
      media: msgs.filter((m) => m.isMedia).length,
      firstReceived,
      startedBy,
      procedure: inferProcedure(firstReceived, received, sent),
      channel: inferChannel(firstReceived, received, startedBy),
      stage: inferStage(msgs, received, sent),
      awaitingReply: last.direction === 'Recebida',
      awaitingHours: last.direction === 'Recebida' ? hoursSinceLast : 0,
      silentHours: last.direction === 'Enviada' ? hoursSinceLast : 0,
      firstResponseMin: responseTimes.length ? responseTimes[0] : null,
      medianResponseMin: median(responseTimes),
      responseTimes,
      askedPrice: received.some((m) => PRICE_RE.test(m.text)),
      askedSchedule: received.some((m) => SCHEDULE_RE.test(m.text)),
      askedAddress: received.some((m) => ADDRESS_RE.test(m.text)),
      csvStatus,
    })
  })

  convs.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
  return convs
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

export function presetRange(
  preset: Filters['preset'],
  refTime: Date,
  minTime: Date,
  custom: { from: string; to: string },
): { from: string; to: string } {
  const to = toDateKey(refTime)
  const start = new Date(refTime)
  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 6)
      return { from: toDateKey(start), to }
    case '30d':
      start.setDate(start.getDate() - 29)
      return { from: toDateKey(start), to }
    case 'month':
      return { from: toDateKey(new Date(refTime.getFullYear(), refTime.getMonth(), 1)), to }
    case 'custom':
      return { from: custom.from || toDateKey(minTime), to: custom.to || to }
    default:
      return { from: toDateKey(minTime), to }
  }
}

export function statusOf(conv: Conversation, meta: MetaMap): Status | undefined {
  return meta[conv.key]?.status
}

export function applyFilters(
  convs: Conversation[],
  messages: Message[],
  range: { from: string; to: string },
  filters: Filters,
  meta: MetaMap,
): { convs: Conversation[]; messages: Message[] } {
  const inRange = (k: string) => k >= range.from && k <= range.to
  const allowed = new Set<string>()
  const outConvs: Conversation[] = []
  for (const c of convs) {
    if (filters.procedure !== 'all' && c.procedure !== filters.procedure) continue
    if (filters.channel !== 'all' && c.channel !== filters.channel) continue
    if (filters.line !== 'all' && c.line !== (filters.line === LINE_NONE ? '' : filters.line)) continue
    const st = statusOf(c, meta)
    if (filters.status === 'sem_status' ? st !== undefined : filters.status !== 'all' && st !== filters.status) continue
    if (!c.messages.some((m) => inRange(m.dateKey))) continue
    allowed.add(c.key)
    outConvs.push(c)
  }
  const outMsgs = messages.filter((m) => allowed.has(m.convKey || m.phone) && inRange(m.dateKey))
  return { convs: outConvs, messages: outMsgs }
}

/* ------------------------------------------------------------------ */
/* Agregações                                                          */
/* ------------------------------------------------------------------ */

export interface DayPoint {
  date: string
  label: string
  recebidas: number
  enviadas: number
}

export function messagesPerDay(msgs: Message[], range: { from: string; to: string }): DayPoint[] {
  const map = new Map<string, DayPoint>()
  const cur = fromDateKey(range.from)
  const end = fromDateKey(range.to)
  while (cur <= end) {
    const k = toDateKey(cur)
    map.set(k, { date: k, label: fmtShortDate(cur), recebidas: 0, enviadas: 0 })
    cur.setDate(cur.getDate() + 1)
  }
  for (const m of msgs) {
    const p = map.get(m.dateKey)
    if (!p) continue
    if (m.direction === 'Recebida') p.recebidas++
    else p.enviadas++
  }
  return [...map.values()]
}

export interface WeekPoint {
  key: string
  label: string
  leads: number
}

export function newLeadsPerWeek(convs: Conversation[], range: { from: string; to: string }): WeekPoint[] {
  const map = new Map<string, WeekPoint>()
  const cur = isoWeekKey(fromDateKey(range.from)).monday
  const end = fromDateKey(range.to)
  while (cur <= end) {
    const { key, monday } = isoWeekKey(cur)
    map.set(key, { key, label: `${fmtShortDate(monday)}`, leads: 0 })
    cur.setDate(cur.getDate() + 7)
  }
  for (const c of convs) {
    if (c.isGroup) continue
    const k = toDateKey(c.firstAt)
    if (k < range.from || k > range.to) continue
    const p = map.get(isoWeekKey(c.firstAt).key)
    if (p) p.leads++
  }
  return [...map.values()]
}

export interface NamedCount {
  name: string
  value: number
}

export function countBy<T>(items: T[], fn: (t: T) => string, limit = 8): NamedCount[] {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = fn(it)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const arr = [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  if (arr.length <= limit) return arr
  const head = arr.slice(0, limit - 1)
  const tail = arr.slice(limit - 1).reduce((s, x) => s + x.value, 0)
  return [...head, { name: 'Outros', value: tail }]
}

export function heatmapReceived(msgs: Message[]): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const m of msgs) {
    if (m.direction !== 'Recebida') continue
    grid[m.at.getDay()][m.at.getHours()]++
  }
  return grid
}

export function hourProfile(msgs: Message[]): { hour: number; label: string; recebidas: number; enviadas: number }[] {
  const arr = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}h`, recebidas: 0, enviadas: 0 }))
  for (const m of msgs) {
    if (m.direction === 'Recebida') arr[m.at.getHours()].recebidas++
    else arr[m.at.getHours()].enviadas++
  }
  return arr
}

export function leadConversations(convs: Conversation[], meta: MetaMap): Conversation[] {
  return convs.filter((c) => !c.isGroup && !c.isInternal && statusOf(c, meta) !== 'nao_lead')
}

export interface FunnelStep {
  id: string
  label: string
  count: number
  hint: string
}

const STAGE_RANK: Record<Stage, number> = {
  sem_retorno_lead: -1,
  sem_resposta_clinica: 0,
  contato: 1,
  engajado: 2,
  pediu_agendamento: 3,
  agendamento: 4,
  pagamento: 5,
}

export function funnel(leads: Conversation[]): FunnelStep[] {
  const wrote = leads.filter((c) => c.received > 0)
  const rank = (c: Conversation) => STAGE_RANK[c.stage]
  return [
    { id: 'wrote', label: 'Leads que escreveram', count: wrote.length, hint: 'Conversas com pelo menos uma mensagem recebida' },
    { id: 'replied', label: 'Clínica respondeu', count: wrote.filter((c) => c.sent > 0).length, hint: 'Pelo menos uma mensagem enviada pela clínica' },
    { id: 'engaged', label: 'Lead engajou', count: wrote.filter((c) => rank(c) >= 2).length, hint: 'Lead voltou a escrever depois da resposta' },
    { id: 'asked', label: 'Pediu agendamento', count: wrote.filter((c) => rank(c) >= 3).length, hint: 'Mencionou agendar, avaliação ou horário' },
    { id: 'scheduled', label: 'Agendamento ou pagamento', count: wrote.filter((c) => rank(c) >= 4).length, hint: 'Clínica confirmou horário, ou houve menção a Pix / sinal' },
  ]
}

export function stageCount(leads: Conversation[], stage: Stage): number {
  return leads.filter((c) => c.stage === stage).length
}

export interface Bucket {
  label: string
  count: number
}

const RESPONSE_BUCKETS: { label: string; max: number }[] = [
  { label: 'até 5 min', max: 5 },
  { label: '5–15 min', max: 15 },
  { label: '15–60 min', max: 60 },
  { label: '1–4 h', max: 240 },
  { label: '4–24 h', max: 1440 },
  { label: '+24 h', max: Infinity },
]

export function responseBuckets(values: number[]): Bucket[] {
  const out = RESPONSE_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  for (const v of values) {
    const idx = RESPONSE_BUCKETS.findIndex((b) => v < b.max)
    out[idx === -1 ? out.length - 1 : idx].count++
  }
  return out
}

export function shareWithin(values: number[], maxMin: number): number {
  if (!values.length) return NaN
  return values.filter((v) => v <= maxMin).length / values.length
}

export function awaitingList(leads: Conversation[]): Conversation[] {
  return leads.filter((c) => c.awaitingReply).sort((a, b) => b.awaitingHours - a.awaitingHours)
}

export function coldList(leads: Conversation[], meta: MetaMap, minHours = 48): Conversation[] {
  return leads
    .filter((c) => {
      const st = statusOf(c, meta)
      if (st && FINAL_STATUSES.includes(st)) return false
      return !c.awaitingReply && c.received > 0 && c.silentHours >= minHours && STAGE_RANK[c.stage] >= 2 && STAGE_RANK[c.stage] < 4
    })
    .sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage] || a.silentHours - b.silentHours)
}

export interface RateRow {
  name: string
  total: number
  hits: number
  rate: number
}

export function scheduleRateBy(leads: Conversation[], meta: MetaMap, fn: (c: Conversation) => string, minTotal = 5): RateRow[] {
  const map = new Map<string, { total: number; hits: number }>()
  for (const c of leads) {
    if (c.received === 0) continue
    const k = fn(c)
    const e = map.get(k) ?? { total: 0, hits: 0 }
    e.total++
    const st = statusOf(c, meta)
    if (st === 'agendado' || st === 'convertido' || STAGE_RANK[c.stage] >= 4) e.hits++
    map.set(k, e)
  }
  return [...map.entries()]
    .filter(([, v]) => v.total >= minTotal)
    .map(([name, v]) => ({ name, total: v.total, hits: v.hits, rate: v.hits / v.total }))
    .sort((a, b) => b.rate - a.rate)
}

export function manualStatusCounts(convs: Conversation[], meta: MetaMap, order: Status[], labels: Record<Status, string>): NamedCount[] {
  const map = new Map<Status, number>()
  let none = 0
  for (const c of convs) {
    const st = statusOf(c, meta)
    if (st) map.set(st, (map.get(st) ?? 0) + 1)
    else none++
  }
  const rows: NamedCount[] = order.map((s) => ({ name: labels[s], value: map.get(s) ?? 0 }))
  rows.push({ name: 'Sem status', value: none })
  return rows
}

export interface LineRow {
  line: string // '' = não identificado
  attendants: string[]
  leads: number
  newLeads: number
  received: number
  sent: number
  firstResponseMin: number | null
  within15: number // fração das 1ªs respostas em até 15 min
  awaiting: number
}

/** Uma linha por número da empresa (mais "não identificado", se houver), com os mesmos recortes da Visão geral. */
export function lineSummary(
  leads: Conversation[],
  msgs: Message[],
  range: { from: string; to: string },
  clinicPhones: string[],
  attendants: Map<string, string[]>,
): LineRow[] {
  const lineOfConv = new Map(leads.map((c) => [c.key, c.line]))
  const rows = new Map<string, LineRow>()
  const row = (line: string): LineRow => {
    let r = rows.get(line)
    if (!r) {
      r = { line, attendants: attendants.get(line) ?? [], leads: 0, newLeads: 0, received: 0, sent: 0, firstResponseMin: null, within15: NaN, awaiting: 0 }
      rows.set(line, r)
    }
    return r
  }
  for (const p of clinicPhones) row(p)

  const firstTimes = new Map<string, number[]>()
  for (const c of leads) {
    const r = row(c.line)
    r.leads++
    const k = toDateKey(c.firstAt)
    if (k >= range.from && k <= range.to) r.newLeads++
    if (c.awaitingReply) r.awaiting++
    if (c.firstResponseMin != null) {
      const arr = firstTimes.get(c.line)
      if (arr) arr.push(c.firstResponseMin)
      else firstTimes.set(c.line, [c.firstResponseMin])
    }
  }
  for (const m of msgs) {
    const line = lineOfConv.get(m.convKey || m.phone)
    if (line === undefined) continue
    if (m.direction === 'Recebida') row(line).received++
    else row(line).sent++
  }
  rows.forEach((r, line) => {
    const times = firstTimes.get(line) ?? []
    r.firstResponseMin = median(times)
    r.within15 = shareWithin(times, 15)
  })
  // Números sem nenhuma atividade no recorte atual (ex.: filtro de número ativo) ficam de fora.
  return [...rows.values()]
    .filter((r) => r.leads > 0 || r.received + r.sent > 0)
    .sort((a, b) => (a.line === '' ? 1 : b.line === '' ? -1 : clinicPhones.indexOf(a.line) - clinicPhones.indexOf(b.line)))
}
