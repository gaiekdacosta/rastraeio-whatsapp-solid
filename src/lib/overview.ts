import type { AppUser } from '../auth/types'
import { makeCatalog } from './blocks'

/** Blocos da aba Visão geral que o administrador escolhe mostrar para cada usuário. */
export const OVERVIEW = [
  { id: 'leads', label: 'Conversas de leads', group: 'Indicadores' },
  { id: 'novos-leads', label: 'Novos leads no período', group: 'Indicadores' },
  { id: 'recebidas', label: 'Mensagens recebidas', group: 'Indicadores' },
  { id: 'enviadas', label: 'Mensagens enviadas', group: 'Indicadores' },
  { id: 'primeira-resposta', label: 'Mediana da 1ª resposta', group: 'Indicadores' },
  { id: 'aguardando-resposta', label: 'Aguardando resposta da clínica', group: 'Indicadores' },
  { id: 'sem-status', label: 'Sem status manual', group: 'Indicadores' },
  { id: 'atendimento-numero', label: 'Atendimento por número (só com mais de um número liberado)', group: 'Gráficos e tabelas' },
  { id: 'mensagens-dia', label: 'Mensagens por dia', group: 'Gráficos e tabelas' },
  { id: 'leads-semana', label: 'Novos leads por semana', group: 'Gráficos e tabelas' },
  { id: 'procedimentos', label: 'Procedimentos de interesse', group: 'Gráficos e tabelas' },
  { id: 'estagio', label: 'Estágio inferido das conversas', group: 'Gráficos e tabelas' },
  { id: 'status-manual', label: 'Status manual', group: 'Gráficos e tabelas' },
  { id: 'aguardando', label: 'Leads aguardando resposta da clínica', group: 'Listas de leads' },
] as const

export type OverviewId = (typeof OVERVIEW)[number]['id']

export const OVERVIEW_CATALOG = makeCatalog<OverviewId>(OVERVIEW)

export const ALL_OVERVIEW = OVERVIEW_CATALOG.all

/** Blocos da Visão geral que a pessoa vê: administradores e quem nunca teve seleção (null) veem todos. */
export function visibleOverview(user: Pick<AppUser, 'papel' | 'visaoGeral'>): Set<OverviewId> {
  return user.papel === 'admin' ? new Set(ALL_OVERVIEW) : OVERVIEW_CATALOG.visible(user.visaoGeral)
}

/** Seleção para gravar: tudo marcado vira null (todos, inclusive blocos criados depois). */
export const storeOverview = OVERVIEW_CATALOG.store

/** Resumo para a tabela de usuários: "todos", "nenhum" ou "5 de 14". */
export function overviewSummary(user: Pick<AppUser, 'papel' | 'visaoGeral'>): string {
  return user.papel === 'admin' ? 'todos' : OVERVIEW_CATALOG.summary(user.visaoGeral)
}
