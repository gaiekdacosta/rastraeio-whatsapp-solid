import type { AdSource, Channel, Conversation, Filters, Message, Stage, Status } from './types'
import type { MetaMap } from './storage'
import { FINAL_STATUSES } from './status'
import { SEM_NUMERO } from './access'
import { CLASS_NONE, CLASS_NONE_LABEL, classKey, classPlural, leadsOf, parseClassification } from './classification'
import { DEFAULT_SEGMENTO, cap } from './segment'
import type { Segmento, Vocab } from './segment'
import { fmtShortDate, fromDateKey, isoWeekKey, toDateKey } from './format'

/* ------------------------------------------------------------------ */
/* Heurísticas de texto                                                */
/* ------------------------------------------------------------------ */

interface Item {
  name: string
  re: RegExp
}

/** Procedimentos de clínicas de estética e odontologia. */
const PROCEDURES: Item[] = [
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

/** Produtos de loja (moda primeiro, que é o caso mais comum); a primeira categoria que aparecer vale. */
const PRODUCTS: Item[] = [
  { name: 'Conjuntos e kits', re: /\bconjuntos?\b|\bkits?\b/i },
  { name: 'Polos', re: /\bpolos?\b/i },
  { name: 'Calçados', re: /t[êe]nis|\bsapatos?\b|chinel[ao]s?|sand[áa]lias?|\bslides?\b|\bcrocs\b|\bbotas?\b/i },
  { name: 'Camisas e blusas', re: /\bcamis(?:a|as|eta|etas)\b|\bblusas?\b|\bregatas?\b/i },
  { name: 'Calças', re: /\bcal[çc]as?\b|\bjeans\b/i },
  { name: 'Bermudas e shorts', re: /\bbermudas?\b|\bshorts?\b/i },
  { name: 'Jaquetas e moletons', re: /jaquetas?|moletons?|casacos?|corta.?ventos?/i },
  { name: 'Vestidos e saias', re: /\bvestidos?\b|\bsaias?\b|macac[ãa]o|cropped/i },
  { name: 'Moda íntima', re: /\bcuecas?\b|calcinhas?|suti[ãa]s?|lingerie|\bpijamas?\b/i },
  { name: 'Acessórios', re: /\bbon[ée]s?\b|rel[óo]gios?|[óo]culos|\bcorrentes?\b|pulseiras?|\bcintos?\b|carteiras?|\bbolsas?\b|mochilas?|chap[ée]us?|perfumes?/i },
]

const CTA_RE = /tenho interesse (?:n[oa]s?|em|no m[ée]todo)\s+(.+?)\s*[!.?]/i
const INSTAGRAM_RE = /instagram|\binsta\b|vim do (?:story|stories|reels|perfil)/i
const PRICE_RE = /\bvalor(?:es)?\b|pre[çc]o|quanto (?:custa|fica|[ée]|t[áa]|sai)|\bcusta\b|or[çc]amento|parcel|\bpix\b/i
const SCHEDULE_RE = /agend|avalia[çc][ãa]o|\bavaliar\b|marcar|hor[áa]rio|dispon[ií]/i
const ADDRESS_RE = /endere[çc]o|onde fica|localiza|fica onde|\blocal\b/i
const PAYMENT_RE = /\bpix\b|comprovante|pagamento|sinal (?:de|para|do)|\bpagou\b|\bpago\b|\bpaga\b|checkout/i
const CONFIRMED_RE =
  /agendad|confirmad[oa]|marcad[oa]|sua (?:consulta|avalia[çc][ãa]o) (?:est[áa]|fica|ser[áa])|te espero|esperamos voc[êe]|at[ée] (?:l[áa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|amanh[ãa])|hor[áa]rio (?:confirmado|reservado)/i
/** Loja: o lead quer comprar (tamanho, estoque, entrega, "vou levar"). Perguntar o preço conta à parte (PRICE_RE). */
const PURCHASE_RE =
  /tamanho|numera[çc][ãa]o|\b(?:tem|tens|teria|tinha|t[eê]m)\b[^?.!]{0,25}\b(?:no|na|tamanho|cor|cores|dispon\w*|ainda|outra)\b|dispon[ií]ve|estoque|\bquero (?:ess[ae]s?|est[ae]s?|levar|comprar|pegar|o kit|um|uma|dois|duas|\d)|vou (?:querer|levar|pegar|comprar|ficar com)|\bsepara(?:r)? (?:pra|para|ess)|\breserva|entreg[au]|\bfrete\b|retir(?:ar|ada|o)\b|\bvou (?:a[ií]|passar a[ií]|ir a[ií])|como (?:fa[çc]o (?:pra|para) (?:comprar|pedir)|compro)|forma de pagamento|\bcomprar\b/i
/** Loja: a loja confirmou o pedido (separou, reservou, mandou entregar). */
const ORDER_RE =
  /\bseparei\b|\bsepar(?:o|ar|ando) (?:aqui |agora |j[áa] )?(?:pra|para)|deixei (?:tudo |o seu |seu )?separad|j[áa] (?:separei|reservei|enviei)|\breservei\b|pedido (?:confirmado|anotado|separado|registrado|enviado)|seu pedido|saiu para entrega|c[óo]digo de rastreio|motoboy|entregador|a caminho|pode vir (?:buscar|retirar)|te espero|esperamos voc[êe]|obrigad[oa] pela (?:compra|prefer[êe]ncia)|compra confirmada/i

interface Matcher {
  test(text: string): boolean
}
const either = (a: Matcher, b: Matcher): Matcher => ({ test: (t) => a.test(t) || b.test(t) })

/** O que cada tipo de negócio procura nas mensagens (os rótulos ficam em lib/segment.ts). */
interface Rules {
  items: Item[]
  /** Na falta do item nas mensagens do lead, procurar nas respostas da empresa. Loja não: as respostas listam vários produtos. */
  itemsFromSent: boolean
  /** Lead mostrou intenção (estágio pediu_agendamento). */
  intent: Matcher
  /** Empresa sinalizou o fechamento (estágio agendamento). */
  closed: Matcher
}

const RULES: Record<Segmento, Rules> = {
  clinica: { items: PROCEDURES, itemsFromSent: true, intent: SCHEDULE_RE, closed: CONFIRMED_RE },
  loja: { items: PRODUCTS, itemsFromSent: false, intent: PURCHASE_RE, closed: ORDER_RE },
  outro: { items: [], itemsFromSent: false, intent: either(SCHEDULE_RE, PURCHASE_RE), closed: either(CONFIRMED_RE, ORDER_RE) },
}

function canonicalItem(text: string, items: Item[]): string | null {
  for (const p of items) if (p.re.test(text)) return p.name
  return null
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Procedimento (clínica) ou produto (loja) de interesse do lead. */
function inferProcedure(firstReceived: Message | null, received: Message[], sent: Message[], rules: Rules): string {
  if (firstReceived) {
    const m = firstReceived.text.match(CTA_RE)
    if (m) {
      const captured = m[1].trim()
      return canonicalItem(captured, rules.items) ?? titleCase(captured)
    }
  }
  for (const msg of received) {
    if (msg.isMedia) continue
    const p = canonicalItem(msg.text, rules.items)
    if (p) return p
  }
  // Fallback: o que a clínica explicou ao lead costuma nomear o procedimento.
  if (rules.itemsFromSent)
    for (const msg of sent) {
      if (msg.isMedia) continue
      const p = canonicalItem(msg.text, rules.items)
      if (p) return p
    }
  return 'Não identificado'
}

function inferChannel(firstReceived: Message | null, received: Message[], startedBy: 'Recebida' | 'Enviada', hasAd: boolean): Channel {
  // Anúncio: CTA "tenho interesse…", coluna Anúncio da planilha ou mensagem padrão repetida por vários leads.
  if ((firstReceived && CTA_RE.test(firstReceived.text)) || hasAd) return 'Anúncio (CTA)'
  if (received.some((m) => INSTAGRAM_RE.test(m.text))) return 'Instagram'
  if (startedBy === 'Enviada') return 'Prospecção ativa'
  return 'Orgânico / outro'
}

function inferStage(msgs: Message[], received: Message[], sent: Message[], rules: Rules): Stage {
  if (sent.length === 0) return 'sem_resposta_clinica'
  if (received.length === 0) return 'sem_retorno_lead'
  if (msgs.some((m) => PAYMENT_RE.test(m.text))) return 'pagamento'
  if (sent.some((m) => rules.closed.test(m.text))) return 'agendamento'
  if (received.some((m) => rules.intent.test(m.text))) return 'pediu_agendamento'
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
/* Classificação e anúncio                                             */
/* ------------------------------------------------------------------ */

/** Valor do filtro de anúncio para leads sem anúncio identificado. */
export const AD_NONE = 'none'
export const AD_NONE_LABEL = 'Sem anúncio'

const normText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Mensagem inicial que chega igual de muitos leads é o texto padrão de um anúncio (botão do WhatsApp). */
const AD_TEMPLATE_MIN_LEADS = 5
const AD_TEMPLATE_MIN_CHARS = 20
const AD_NAME_MAX = 70

function shorten(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > AD_NAME_MAX ? `${t.slice(0, AD_NAME_MAX - 1)}…` : t
}

/** Mensagem padrão sem a saudação do começo ("Olá! Quero aproveitar…" → "Quero aproveitar…"), para os nomes não começarem todos iguais. */
const GREETING_RE = /^(?:ol[áa]|oi|opa|e a[ií]|bom dia|boa tarde|boa noite|tudo bem\??)[\s,.!?]*/i
function templateName(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const rest = t.replace(GREETING_RE, '').replace(GREETING_RE, '')
  return shorten(rest.length >= 10 ? rest[0].toUpperCase() + rest.slice(1) : t)
}

/**
 * Anúncio do lead: a coluna Anúncio da planilha (último valor preenchido) ou, sem ela, a mensagem padrão
 * com que o lead chegou: a frase do CTA ("tenho interesse no…") ou, se a primeira mensagem é idêntica à
 * de vários outros leads, o texto inteiro.
 */
function inferAd(msgs: Message[], firstReceived: Message | null, templates: Map<string, number>): { ad: string; adSource: AdSource } {
  let fromSheet = ''
  for (const m of msgs) if (m.ad) fromSheet = m.ad
  if (fromSheet) return { ad: shorten(fromSheet), adSource: 'planilha' }
  if (firstReceived && !firstReceived.isMedia) {
    const cta = firstReceived.text.match(CTA_RE)
    if (cta) return { ad: titleCase(cta[1].trim()), adSource: 'mensagem' }
    const key = normText(firstReceived.text)
    if (key.length >= AD_TEMPLATE_MIN_CHARS && (templates.get(key) ?? 0) >= AD_TEMPLATE_MIN_LEADS)
      return { ad: templateName(firstReceived.text), adSource: 'mensagem' }
  }
  return { ad: '', adSource: '' }
}

/** Classificação atual do lead: o último valor preenchido na coluna Classificação entre as linhas da conversa. */
function inferClassification(msgs: Message[]): string | null {
  let c: string | null = null
  for (const m of msgs) {
    const v = parseClassification(m.classification)
    if (v) c = v
  }
  return c
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

/**
 * `segmentOf` diz o tipo de negócio de cada chave de acesso (número da empresa ou SEM_NUMERO para conversa
 * sem número): ele escolhe as palavras que as heurísticas procuram (procedimento × produto, agendamento × pedido).
 */
export function buildConversations(
  messages: Message[],
  refTime: Date,
  clinicPhones: string[] = [],
  segmentOf: (accessKey: string) => Segmento = () => DEFAULT_SEGMENTO,
): Conversation[] {
  const groups = new Map<string, Message[]>()
  for (const m of messages) {
    const key = m.convKey || m.phone
    const arr = groups.get(key)
    if (arr) arr.push(m)
    else groups.set(key, [m])
  }

  // Quantas conversas começam com a mesma mensagem: serve para reconhecer o texto padrão de cada anúncio.
  const templates = new Map<string, number>()
  groups.forEach((msgs, key) => {
    if (isGroupId(key)) return
    const first = msgs.reduce((a, b) => (b.at.getTime() < a.at.getTime() || (b.at.getTime() === a.at.getTime() && b.id < a.id) ? b : a))
    if (first.direction !== 'Recebida' || first.isMedia) return
    const k = normText(first.text)
    if (k.length >= AD_TEMPLATE_MIN_CHARS) templates.set(k, (templates.get(k) ?? 0) + 1)
  })

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
    const lines = conversationLines(sent, clinicPhones)
    const rules = RULES[segmentOf(lines.line || SEM_NUMERO)] // mesma chave de accessKey()
    const ad = inferAd(msgs, firstReceived, templates)

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
      ...lines,
      messages: msgs,
      firstAt: msgs[0].at,
      lastAt: last.at,
      received: received.length,
      sent: sent.length,
      media: msgs.filter((m) => m.isMedia).length,
      firstReceived,
      startedBy,
      procedure: inferProcedure(firstReceived, received, sent, rules),
      channel: inferChannel(firstReceived, received, startedBy, !!ad.ad),
      stage: inferStage(msgs, received, sent, rules),
      classification: inferClassification(msgs),
      ...ad,
      awaitingReply: last.direction === 'Recebida',
      awaitingHours: last.direction === 'Recebida' ? hoursSinceLast : 0,
      silentHours: last.direction === 'Enviada' ? hoursSinceLast : 0,
      firstResponseMin: responseTimes.length ? responseTimes[0] : null,
      medianResponseMin: median(responseTimes),
      responseTimes,
      askedPrice: received.some((m) => PRICE_RE.test(m.text)),
      askedIntent: received.some((m) => rules.intent.test(m.text)),
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
    if (filters.classification !== 'all' && (c.classification ?? CLASS_NONE) !== filters.classification) continue
    if (filters.ad !== 'all' && (c.ad || AD_NONE) !== filters.ad) continue
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

export function funnel(leads: Conversation[], v: Vocab): FunnelStep[] {
  const wrote = leads.filter((c) => c.received > 0)
  const rank = (c: Conversation) => STAGE_RANK[c.stage]
  return [
    { id: 'wrote', label: 'Leads que escreveram', count: wrote.length, hint: 'Conversas com pelo menos uma mensagem recebida' },
    { id: 'replied', label: `${v.Empresa} respondeu`, count: wrote.filter((c) => c.sent > 0).length, hint: `Pelo menos uma mensagem enviada pela ${v.empresa}` },
    { id: 'engaged', label: 'Lead engajou', count: wrote.filter((c) => rank(c) >= 2).length, hint: 'Lead voltou a escrever depois da resposta' },
    { id: 'asked', label: v.intencao, count: wrote.filter((c) => rank(c) >= 3).length, hint: v.intencaoCriterio },
    { id: 'scheduled', label: `${cap(v.fechamento)} ou pagamento`, count: wrote.filter((c) => rank(c) >= 4).length, hint: v.fechamentoCriterio },
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
    if (isScheduled(c, meta)) e.hits++
    map.set(k, e)
  }
  return [...map.entries()]
    .filter(([, v]) => v.total >= minTotal)
    .map(([name, v]) => ({ name, total: v.total, hits: v.hits, rate: v.hits / v.total }))
    .sort((a, b) => b.rate - a.rate)
}

/** Fechou (agendou, fez pedido): status "agendado"/Convertido ou fechamento/pagamento sinalizado na conversa. */
export function isScheduled(c: Conversation, meta: MetaMap): boolean {
  const st = statusOf(c, meta)
  return st === 'agendado' || st === 'convertido' || STAGE_RANK[c.stage] >= 4
}

/**
 * Venda: só o status manual Convertido (dado na aba Conversas ou vindo da coluna status_manual da planilha).
 * "Pagamento sinalizado" é heurística e fica fora: num relatório para o cliente, venda tem que ser confirmada.
 */
export function isSale(c: Conversation, meta: MetaMap): boolean {
  return statusOf(c, meta) === 'convertido'
}

/** Leads por classificação, na ordem de `classes` (escala primeiro), mais "Sem classificação" no fim (só linhas com valor). */
export function classificationCounts(leads: Conversation[], classes: string[]): NamedCount[] {
  const rows = classes.map((c) => ({ name: c, value: leads.filter((l) => l.classification === c).length }))
  rows.push({ name: CLASS_NONE_LABEL, value: leads.filter((l) => !l.classification).length })
  return rows.filter((r) => r.value > 0)
}

/** Uma linha por anúncio; cada classificação conta na chave classKey(rótulo). */
export interface AdRow {
  ad: string
  source: AdSource
  leads: number
  semClassificacao: number
  agendados: number
  vendas: number
  [key: string]: string | number
}

/** 'leads', 'agendados', 'vendas' ou classKey(classificação). */
export type AdMetric = string

export interface AdMetricOption {
  id: AdMetric
  label: string
  short: string
}

/** Opções do seletor do ranking: leads, cada classificação da base, fechamentos (agendamentos, pedidos…) e vendas. */
export function adMetrics(classes: string[], v: Vocab): AdMetricOption[] {
  return [
    { id: 'leads', label: 'Mais leads', short: 'Leads' },
    ...classes.map((c) => ({ id: classKey(c), label: `Mais ${leadsOf(c)}`, short: classPlural(c) })),
    { id: 'agendados', label: `Mais ${v.fechamentos}`, short: v.fechados },
    { id: 'vendas', label: 'Mais vendas', short: 'Vendas' },
  ]
}

/** Uma linha por anúncio (leads sem anúncio ficam de fora), sem ordenação. */
export function adSummary(leads: Conversation[], meta: MetaMap): AdRow[] {
  const map = new Map<string, AdRow>()
  for (const c of leads) {
    if (!c.ad) continue
    let r = map.get(c.ad)
    if (!r) {
      r = { ad: c.ad, source: c.adSource, leads: 0, semClassificacao: 0, agendados: 0, vendas: 0 }
      map.set(c.ad, r)
    }
    r.leads++
    if (c.classification) {
      const k = classKey(c.classification)
      r[k] = (Number(r[k]) || 0) + 1
    } else r.semClassificacao++
    if (isScheduled(c, meta)) r.agendados++
    if (isSale(c, meta)) r.vendas++
  }
  return [...map.values()]
}

/** Valor de uma métrica numa linha (classificação que o anúncio não teve = 0). */
export function adValue(row: AdRow, metric: AdMetric): number {
  return Number(row[metric]) || 0
}

/** Anúncios ordenados pela métrica escolhida (desempate pelo total de leads e pelo nome). */
export function rankAds(rows: AdRow[], metric: AdMetric): AdRow[] {
  return [...rows].sort((a, b) => adValue(b, metric) - adValue(a, metric) || b.leads - a.leads || a.ad.localeCompare(b.ad, 'pt-BR'))
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
