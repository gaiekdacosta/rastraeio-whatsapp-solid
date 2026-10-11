import type { AppUser } from '../auth/types'
import { ALL_INSIGHTS, insightsSummary, storeInsights, visibleInsights } from './insights'
import type { InsightId } from './insights'
import { ALL_OVERVIEW, overviewSummary, storeOverview, visibleOverview } from './overview'
import type { OverviewId } from './overview'

/*
 * O "painel" de um usuário é o conjunto de blocos que ele vê nas abas Visão geral e Insights.
 * Cada aba tem o próprio catálogo e a própria coluna em perfis (visao_geral e insights); aqui só
 * juntamos as duas para o seletor e para o resumo da tabela de usuários.
 */

export interface PanelSelection {
  visaoGeral: Set<OverviewId>
  insights: Set<InsightId>
}

type PanelUser = Pick<AppUser, 'papel' | 'visaoGeral' | 'insights'>

/** Tudo marcado (padrão de quem está sendo criado). */
export const fullPanel = (): PanelSelection => ({ visaoGeral: new Set(ALL_OVERVIEW), insights: new Set(ALL_INSIGHTS) })

/** Seleção atual de um usuário (administradores e quem nunca teve seleção: tudo). */
export function panelOf(user: PanelUser): PanelSelection {
  return { visaoGeral: visibleOverview(user), insights: visibleInsights(user) }
}

/** Campos do perfil a gravar; em cada aba, tudo marcado vira null. */
export function storePanel(sel: PanelSelection): { visaoGeral: OverviewId[] | null; insights: InsightId[] | null } {
  return { visaoGeral: storeOverview(sel.visaoGeral), insights: storeInsights(sel.insights) }
}

export const PANEL_TOTAL = ALL_OVERVIEW.length + ALL_INSIGHTS.length

/** Para a tabela de usuários: "todos", "nenhum" ou "12 de 25", somando as duas abas. */
export function panelSummary(user: PanelUser): string {
  if (user.papel === 'admin') return 'todos'
  const n = visibleOverview(user).size + visibleInsights(user).size
  return n === PANEL_TOTAL ? 'todos' : n === 0 ? 'nenhum' : `${n} de ${PANEL_TOTAL}`
}

/** Para o tooltip: "Visão geral: 5 de 14 · Insights: todos". */
export function panelDetail(user: PanelUser): string {
  return `Visão geral: ${overviewSummary(user)} · Insights: ${insightsSummary(user)}`
}
