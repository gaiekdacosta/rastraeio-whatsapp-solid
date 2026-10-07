export type Direction = 'Recebida' | 'Enviada'

export interface Message {
  id: number
  at: Date
  dateKey: string // YYYY-MM-DD
  rawDate: string
  time: string
  lead: string
  phone: string
  direction: Direction
  replyTo: string
  text: string
  isMedia: boolean
  statusManual: string
  convKey: string
}

export type Status =
  | 'novo'
  | 'em_atendimento'
  | 'aguardando_lead'
  | 'agendado'
  | 'convertido'
  | 'perdido'
  | 'nao_lead'

export interface ConvMeta {
  status?: Status
  notes?: string
  followUp?: string // YYYY-MM-DD
  updatedAt?: string
}

export type Stage =
  | 'sem_retorno_lead'
  | 'sem_resposta_clinica'
  | 'contato'
  | 'engajado'
  | 'pediu_agendamento'
  | 'agendamento'
  | 'pagamento'

export type Channel = 'Anúncio (CTA)' | 'Instagram' | 'Prospecção ativa' | 'Orgânico / outro'

export interface Conversation {
  key: string
  phone: string
  name: string
  isGroup: boolean
  isInternal: boolean // conversa entre dois números da própria empresa
  line: string // número da empresa que atendeu (o que mais enviou); '' = não identificado
  lines: string[] // todos os números da empresa que enviaram mensagens, do mais ao menos ativo
  messages: Message[]
  firstAt: Date
  lastAt: Date
  received: number
  sent: number
  media: number
  firstReceived: Message | null
  startedBy: Direction
  procedure: string
  channel: Channel
  stage: Stage
  awaitingReply: boolean
  awaitingHours: number
  silentHours: number // horas desde a última msg da clínica sem retorno do lead
  firstResponseMin: number | null
  medianResponseMin: number | null
  responseTimes: number[]
  askedPrice: boolean
  askedSchedule: boolean
  askedAddress: boolean
  csvStatus: string
}

export type RangePreset = 'all' | '7d' | '30d' | 'month' | 'custom'

export interface Filters {
  preset: RangePreset
  from: string // YYYY-MM-DD
  to: string
  procedure: string // 'all' | nome
  status: string // 'all' | 'sem_status' | Status
  channel: string // 'all' | Channel
  line: string // 'all' | 'none' | número da empresa
}

export interface Dataset {
  fileName: string
  messages: Message[]
  clinicPhones: string[] // números da empresa, do que mais enviou ao que menos enviou
  refTime: Date // última mensagem da base inteira (mesma referência para todos os usuários)
  loadedAt: Date
  publishedAt: Date | null
}
