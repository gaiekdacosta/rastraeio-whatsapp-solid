import type { AppUser } from '../auth/types'
import { makeCatalog } from './blocks'

/** Blocos da aba Insights que o administrador escolhe mostrar para cada usuário. */
export const INSIGHTS = [
  { id: 'destaques', label: 'Destaques do período', group: 'Resumo' },
  { id: 'indicadores', label: 'Indicadores (resposta, 1ª resposta, engajamento, pedidos)', group: 'Resumo' },
  { id: 'funil', label: 'Funil inferido das conversas', group: 'Gráficos' },
  { id: 'tempo-resposta', label: 'Tempo até a primeira resposta', group: 'Gráficos' },
  { id: 'mapa-calor', label: 'Quando os leads escrevem (dia × hora)', group: 'Gráficos' },
  { id: 'perfil-horario', label: 'Perfil horário das mensagens', group: 'Gráficos' },
  { id: 'pedidos', label: 'O que os leads pedem', group: 'Gráficos' },
  { id: 'agendamento-procedimento', label: 'Taxa de agendamento por procedimento', group: 'Gráficos' },
  { id: 'canal', label: 'Canal de origem', group: 'Gráficos' },
  { id: 'aguardando', label: 'Aguardando resposta da clínica', group: 'Listas de leads' },
  { id: 'esfriando', label: 'Leads esfriando', group: 'Listas de leads' },
] as const

export type InsightId = (typeof INSIGHTS)[number]['id']

export const INSIGHTS_CATALOG = makeCatalog<InsightId>(INSIGHTS)

export const ALL_INSIGHTS = INSIGHTS_CATALOG.all

export const INSIGHT_GROUPS = INSIGHTS_CATALOG.groups

/** Insights que a pessoa vê: administradores e quem nunca teve seleção (null) veem todos. */
export function visibleInsights(user: Pick<AppUser, 'papel' | 'insights'>): Set<InsightId> {
  return user.papel === 'admin' ? new Set(ALL_INSIGHTS) : INSIGHTS_CATALOG.visible(user.insights)
}

/** Seleção para gravar: tudo marcado vira null (todos, inclusive insights criados depois). */
export const storeInsights = INSIGHTS_CATALOG.store

/** Resumo para a tabela de usuários: "todos", "nenhum" ou "5 de 11". */
export function insightsSummary(user: Pick<AppUser, 'papel' | 'insights'>): string {
  return user.papel === 'admin' ? 'todos' : INSIGHTS_CATALOG.summary(user.insights)
}
