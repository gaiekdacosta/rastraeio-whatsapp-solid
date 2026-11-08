import { Ban, CalendarCheck, CheckCircle2, Clock, Flame, Handshake, MessageCircle, ShoppingBag, Snowflake, Sparkles, Tag, Thermometer, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Stage, Status } from '../lib/types'
import { STATUS_TONE } from '../lib/status'
import type { Segmento } from '../lib/segment'
import { isScale } from '../lib/classification'
import type { ScaleClass } from '../lib/classification'
import { useVocab } from '../vocab'

const ICONS: Record<Status, LucideIcon> = {
  novo: Sparkles,
  em_atendimento: MessageCircle,
  aguardando_lead: Clock,
  agendado: CalendarCheck,
  convertido: CheckCircle2,
  perdido: XCircle,
  nao_lead: Ban,
}

/** Ícone do status "agendado" em cada tipo de negócio (agendamento, pedido, fechamento). */
const FECHADO_ICON: Record<Segmento, LucideIcon> = {
  clinica: CalendarCheck,
  loja: ShoppingBag,
  outro: Handshake,
}

function iconOf(status: Status, segmento: Segmento): LucideIcon {
  return status === 'agendado' ? FECHADO_ICON[segmento] : ICONS[status]
}

export function StatusBadge({ status, small }: { status?: Status; small?: boolean }) {
  const v = useVocab()
  const cls = small ? ' sm' : ''
  if (!status) return <span className={`badge muted${cls}`}>Sem status</span>
  const Icon = iconOf(status, v.segmento)
  return (
    <span className={`badge ${STATUS_TONE[status]}${cls}`}>
      <Icon size={small ? 11 : 12} aria-hidden />
      {v.status[status]}
    </span>
  )
}

const SCALE_ICONS: Record<ScaleClass, LucideIcon> = {
  Frio: Snowflake,
  Morno: Thermometer,
  Quente: Flame,
}

const SCALE_CLASS: Record<ScaleClass, string> = {
  Frio: 'temp-frio',
  Morno: 'temp-morno',
  Quente: 'temp-quente',
}

/** Classificação do lead (coluna Classificação da planilha). Sem classificação, não mostra nada. */
export function ClassificationBadge({ value, small }: { value: string | null; small?: boolean }) {
  if (!value) return null
  const Icon = isScale(value) ? SCALE_ICONS[value] : Tag
  return (
    <span className={`badge ${isScale(value) ? SCALE_CLASS[value] : 'outline'}${small ? ' sm' : ''}`} title="Classificação do lead, conforme a planilha">
      <Icon size={small ? 11 : 12} aria-hidden />
      {value}
    </span>
  )
}

export function StageBadge({ stage, small }: { stage: Stage; small?: boolean }) {
  const v = useVocab()
  return <span className={`badge outline${small ? ' sm' : ''}`}>{v.stage[stage]}</span>
}

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const v = useVocab()
  const Icon = iconOf(status, v.segmento)
  return <Icon size={size} aria-hidden />
}
