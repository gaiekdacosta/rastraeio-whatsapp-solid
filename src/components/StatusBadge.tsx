import { Ban, CalendarCheck, CheckCircle2, Clock, Flame, MessageCircle, Snowflake, Sparkles, Thermometer, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Stage, Status, Temperature } from '../lib/types'
import { STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/status'
import { TEMPERATURE_LABEL } from '../lib/temperature'

const ICONS: Record<Status, LucideIcon> = {
  novo: Sparkles,
  em_atendimento: MessageCircle,
  aguardando_lead: Clock,
  agendado: CalendarCheck,
  convertido: CheckCircle2,
  perdido: XCircle,
  nao_lead: Ban,
}

export function StatusBadge({ status, small }: { status?: Status; small?: boolean }) {
  const cls = small ? ' sm' : ''
  if (!status) return <span className={`badge muted${cls}`}>Sem status</span>
  const Icon = ICONS[status]
  return (
    <span className={`badge ${STATUS_TONE[status]}${cls}`}>
      <Icon size={small ? 11 : 12} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

const TEMP_ICONS: Record<Temperature, LucideIcon> = {
  frio: Snowflake,
  morno: Thermometer,
  quente: Flame,
}

/** Temperatura do lead (coluna Temperatura da planilha). Sem temperatura, não mostra nada. */
export function TemperatureBadge({ temperature, small }: { temperature: Temperature | null; small?: boolean }) {
  if (!temperature) return null
  const Icon = TEMP_ICONS[temperature]
  return (
    <span className={`badge temp-${temperature}${small ? ' sm' : ''}`} title="Temperatura do lead, conforme a planilha">
      <Icon size={small ? 11 : 12} aria-hidden />
      {TEMPERATURE_LABEL[temperature]}
    </span>
  )
}

export function StageBadge({ stage, small }: { stage: Stage; small?: boolean }) {
  return <span className={`badge outline${small ? ' sm' : ''}`}>{STAGE_LABEL[stage]}</span>
}

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const Icon = ICONS[status]
  return <Icon size={size} aria-hidden />
}
