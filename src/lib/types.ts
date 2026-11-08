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
  /** Valor bruto da coluna Classificação ('' quando a planilha não tem a coluna ou a célula está vazia). */
  classification: string
  /** Valor bruto da coluna Anúncio ('' quando a planilha não tem a coluna ou a célula está vazia). */
  ad: string
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

/** De onde veio o nome do anúncio: da coluna da planilha ou da mensagem padrão com que o lead chegou. */
export type AdSource = 'planilha' | 'mensagem' | ''

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
  /** Classificação atual do lead (último valor preenchido na planilha, já normalizado); null = sem classificação. */
  classification: string | null
  /** Anúncio que trouxe o lead; '' = não identificado. */
  ad: string
  adSource: AdSource
  awaitingReply: boolean
  awaitingHours: number
  silentHours: number // horas desde a última msg da empresa sem retorno do lead
  firstResponseMin: number | null
  medianResponseMin: number | null
  responseTimes: number[]
  askedPrice: boolean
  /** Pediu agendamento (clínica) ou mostrou intenção de compra (loja): o estágio "intenção" do tipo de negócio. */
  askedIntent: boolean
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
  cliente: string // 'all' | id do cliente (lib/clients); só o administrador usa
  classification: string // 'all' | rótulo da classificação | CLASS_NONE
  ad: string // 'all' | nome do anúncio | AD_NONE
}

/** Nomes reais das colunas opcionais encontradas na planilha (undefined = a planilha não tem a coluna). */
export interface ExtraColumns {
  classification?: string
  ad?: string
}

export interface Dataset {
  fileName: string
  messages: Message[]
  clinicPhones: string[] // números da empresa, do que mais enviou ao que menos enviou
  refTime: Date // última mensagem da base inteira (mesma referência para todos os usuários)
  loadedAt: Date
  publishedAt: Date | null
  /** arquivo = CSV publicado pelo administrador; online = planilha lida pela internet em intervalos. */
  origem: 'arquivo' | 'online'
  /** Última leitura da planilha online. */
  fetchedAt: Date | null
  columns: ExtraColumns
}
