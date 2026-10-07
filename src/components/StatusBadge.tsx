import { Ban, CalendarCheck, CheckCircle2, Clock, MessageCircle, Sparkles, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Stage, Status } from '../lib/types'
import { STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/status'

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

export function StageBadge({ stage, small }: { stage: Stage; small?: boolean }) {
  return <span className={`badge outline${small ? ' sm' : ''}`}>{STAGE_LABEL[stage]}</span>
}

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const Icon = ICONS[status]
  return <Icon size={size} aria-hidden />
}
