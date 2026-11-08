import type { Stage, Status } from './types'
import { STATUS_FECHADO_LABELS } from './segment'

export const STATUS_ORDER: Status[] = [
  'novo',
  'em_atendimento',
  'aguardando_lead',
  'agendado',
  'convertido',
  'perdido',
  'nao_lead',
]

/** Rótulos de clínica; o painel mostra os do tipo de negócio (useVocab().status), que só mudam o de "agendado". */
export const STATUS_LABEL: Record<Status, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  aguardando_lead: 'Aguardando lead',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
  nao_lead: 'Não é lead',
}

export type Tone = 'neutral' | 'info' | 'warning' | 'good' | 'critical' | 'muted'

export const STATUS_TONE: Record<Status, Tone> = {
  novo: 'neutral',
  em_atendimento: 'info',
  aguardando_lead: 'warning',
  agendado: 'info',
  convertido: 'good',
  perdido: 'critical',
  nao_lead: 'muted',
}

export const FINAL_STATUSES: Status[] = ['agendado', 'convertido', 'perdido', 'nao_lead']

/** Status da coluna status_manual da planilha: aceita o rótulo de qualquer tipo de negócio (Agendado, Pedido feito…) ou o id. */
export function labelToStatus(label: string): Status | undefined {
  const norm = label.trim().toLowerCase()
  if (STATUS_FECHADO_LABELS.some((l) => l.toLowerCase() === norm)) return 'agendado'
  const entry = (Object.entries(STATUS_LABEL) as [Status, string][]).find(
    ([key, l]) => l.toLowerCase() === norm || key === norm,
  )
  return entry?.[0]
}

export const STAGE_ORDER: Stage[] = [
  'sem_retorno_lead',
  'sem_resposta_clinica',
  'contato',
  'engajado',
  'pediu_agendamento',
  'agendamento',
  'pagamento',
]
