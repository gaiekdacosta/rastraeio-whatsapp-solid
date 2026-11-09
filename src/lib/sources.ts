import type { AppUser, FonteOnline } from '../auth/types'
import type { ClientSheets, Message } from './types'
import type { ParseResult } from './parse'
import { buildConversations, referenceTime } from './analytics'
import { clientIdOf } from './clients'

/*
 * Planilhas online por cliente. Cada planilha é de um cliente (empresa das contas da aba Usuários) ou de
 * todos os clientes (empresa vazia, o modelo antigo de uma planilha só para todo mundo).
 *
 * - Usuário comum lê as planilhas do cliente dele; sem nenhuma, as de todos os clientes (recortadas por
 *   número no navegador, como antes). No Supabase, o banco já não entrega as planilhas de outros clientes.
 * - Admin lê todas e vê tudo junto. Se um cliente tem planilha própria e também aparece numa planilha de
 *   todos, as conversas dele saem da de todos, para não contar duas vezes.
 */

export const TODOS_LABEL = 'Todos os clientes'

/** Empresa na forma de comparar: sem espaços nas pontas e sem diferenciar maiúsculas (igual no banco). */
export const empresaKey = (empresa: string) => empresa.trim().toLocaleLowerCase('pt-BR')

export const isTodos = (f: Pick<FonteOnline, 'empresa'>) => !f.empresa.trim()

export const sourceLabel = (f: Pick<FonteOnline, 'empresa'>) => f.empresa.trim() || TODOS_LABEL

/** Planilhas que valem para quem está logado: admin, todas; usuário, as do cliente dele ou, sem nenhuma, as de todos. */
export function sourcesFor(fontes: FonteOnline[], user: Pick<AppUser, 'papel' | 'empresa'>): FonteOnline[] {
  if (user.papel === 'admin') return fontes
  const key = empresaKey(user.empresa)
  const own = key ? fontes.filter((f) => empresaKey(f.empresa) === key) : []
  return own.length ? own : fontes.filter(isTodos)
}

/** Ordem da lista em Dados: a de todos os clientes primeiro, depois por cliente. */
export function sortSources(fontes: FonteOnline[]): FonteOnline[] {
  return [...fontes].sort(
    (a, b) => Number(!isTodos(a)) - Number(!isTodos(b)) || sourceLabel(a).localeCompare(sourceLabel(b), 'pt-BR') || a.url.localeCompare(b.url),
  )
}

export interface SheetPart {
  fonte: FonteOnline
  res: ParseResult
}

export interface MergedSheets {
  res: ParseResult
  /** Só quando há planilhas de clientes. */
  clientSheets?: ClientSheets
  /** Conversas tiradas das planilhas de todos os clientes por estarem também na planilha própria do cliente. */
  dropped: number
}

/** Números da empresa em ordem do que mais enviou ao que menos enviou (o mesmo critério do parser). */
function phonesBySent(messages: Message[]): string[] {
  const sent = new Map<string, number>()
  for (const m of messages) if (m.direction === 'Enviada' && m.phone) sent.set(m.phone, (sent.get(m.phone) ?? 0) + 1)
  return [...sent.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
}

/** Junta as planilhas lidas numa base só (ver o comentário do topo). */
export function mergeSheets(parts: SheetPart[]): MergedSheets {
  if (parts.length === 1 && isTodos(parts[0].fonte)) return { res: parts[0].res, dropped: 0 }

  const clientParts = parts.filter((p) => !isTodos(p.fonte))
  const clients = new Map<string, { nome: string; numeros: string[] }>()
  const convs = new Map<string, Set<string>>()
  const covered = new Set<string>() // números que aparecem em planilha de cliente
  for (const { fonte, res } of clientParts) {
    const id = clientIdOf(fonte.empresa)
    const c = clients.get(id) ?? { nome: fonte.empresa.trim(), numeros: [] }
    c.numeros = [...new Set([...c.numeros, ...res.clinicPhones])]
    clients.set(id, c)
    for (const p of res.clinicPhones) covered.add(p)
    for (const m of res.messages) {
      const set = convs.get(m.convKey)
      if (set) set.add(id)
      else convs.set(m.convKey, new Set([id]))
    }
  }

  let dropped = 0
  const kept: Message[][] = parts.map(({ fonte, res }) => {
    if (!isTodos(fonte) || !clientParts.length) return res.messages
    // Planilha de todos: sai o que o cliente já tem na planilha própria (pelo número que atendeu ou,
    // nos leads sem resposta, pela mesma conversa).
    const drop = new Set<string>()
    for (const c of buildConversations(res.messages, referenceTime(res.messages), res.clinicPhones)) {
      if (c.line ? covered.has(c.line) : convs.has(c.key)) drop.add(c.key)
    }
    dropped += drop.size
    return drop.size ? res.messages.filter((m) => !drop.has(m.convKey)) : res.messages
  })

  // ids novos e únicos: cada planilha numera as próprias linhas a partir do zero.
  let next = 0
  const messages = kept.flatMap((list) => list.map((m) => ({ ...m, id: next++ })))
  messages.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id)

  const fields = [...new Set(parts.flatMap((p) => p.res.fields))]
  const res: ParseResult = {
    messages,
    clinicPhones: phonesBySent(messages),
    skipped: parts.reduce((n, p) => n + p.res.skipped, 0),
    missingColumns: [],
    fields,
    columns: {
      classification: parts.find((p) => p.res.columns.classification)?.res.columns.classification,
      ad: parts.find((p) => p.res.columns.ad)?.res.columns.ad,
    },
  }
  if (!res.columns.classification) delete res.columns.classification
  if (!res.columns.ad) delete res.columns.ad
  return { res, clientSheets: clientParts.length ? { clients, convs } : undefined, dropped }
}
