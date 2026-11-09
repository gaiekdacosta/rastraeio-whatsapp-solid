import type { AppUser } from '../auth/types'
import type { ClientSheets, Conversation } from './types'
import { SEM_NUMERO } from './access'
import { DEFAULT_SEGMENTO } from './segment'
import type { Segmento } from './segment'

/*
 * Cliente = a empresa de uma conta da aba Usuários, com todos os números liberados para ela, ou de uma
 * planilha online ligada a um cliente (com os números que aparecem nela). É o que o administrador escolhe
 * no topo do painel: ao trocar de cliente, todas as abas passam a mostrar só as conversas dele. Não existe
 * tabela própria: tudo vem das contas, dos números liberados e das planilhas.
 */

export const SEM_CLIENTE = 'sem-cliente'

export interface Client {
  id: string
  nome: string
  /** Chaves de acesso liberadas: números (só dígitos) e/ou SEM_NUMERO. */
  numeros: string[]
  /** Contas que pertencem ao cliente (nome ou e-mail). */
  usuarios: string[]
  /** Tipo de negócio: o das contas do cliente (o mais comum, se divergirem). */
  segmento: Segmento
  /** "Sem cliente": chaves da planilha que nenhuma conta tem liberadas. */
  pseudo?: boolean
}

/** Id do cliente de uma empresa (sem diferenciar maiúsculas nem espaços nas pontas). */
export const clientIdOf = (empresa: string) => `cliente:${empresa.trim().toLocaleLowerCase('pt-BR')}`

function keyOf(u: AppUser): { id: string; nome: string } {
  const empresa = u.empresa.trim()
  if (empresa) return { id: clientIdOf(empresa), nome: empresa }
  return { id: `conta:${u.id}`, nome: u.nome.trim() || u.email }
}

/**
 * Agrupa as contas comuns por empresa (conta sem empresa vira um cliente com o próprio nome). `baseKeys`
 * são as chaves de acesso que existem na planilha publicada (números e, se houver leads sem resposta,
 * SEM_NUMERO): as que nenhuma conta tem liberadas viram o pseudocliente "Sem cliente". `sheets`: clientes
 * com planilha online própria, que existem mesmo antes de ter conta e levam os números da planilha.
 */
export function buildClients(users: AppUser[], baseKeys: string[], sheets?: ClientSheets['clients']): Client[] {
  const map = new Map<string, Client>()
  const votes = new Map<string, Map<Segmento, number>>()
  for (const u of users) {
    if (u.papel !== 'usuario') continue
    const { id, nome } = keyOf(u)
    const c = map.get(id) ?? { id, nome, numeros: [], usuarios: [], segmento: u.segmento }
    c.numeros = [...new Set([...c.numeros, ...u.numeros])]
    c.usuarios.push(u.nome.trim() || u.email)
    map.set(id, c)
    const v = votes.get(id) ?? new Map<Segmento, number>()
    v.set(u.segmento, (v.get(u.segmento) ?? 0) + 1)
    votes.set(id, v)
  }
  map.forEach((c, id) => (c.segmento = [...(votes.get(id) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_SEGMENTO))
  sheets?.forEach((sheet, id) => {
    const c = map.get(id)
    if (c) c.numeros = [...new Set([...c.numeros, ...sheet.numeros])]
    else map.set(id, { id, nome: sheet.nome, numeros: [...sheet.numeros], usuarios: [], segmento: DEFAULT_SEGMENTO })
  })
  const clients = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const taken = new Set(clients.flatMap((c) => c.numeros))
  const loose = baseKeys.filter((k) => !taken.has(k))
  if (loose.length) clients.push({ id: SEM_CLIENTE, nome: 'Sem cliente', numeros: loose, usuarios: [], segmento: DEFAULT_SEGMENTO, pseudo: true })
  return clients
}

/**
 * A conversa é do cliente? Pelo número que atendeu; nos leads que nunca receberam resposta, pela planilha
 * de onde vieram (planilha do cliente) ou, se vieram de uma planilha de todos, por "Sem número" liberado.
 */
export function clientMatcher(client: Client, sheets?: ClientSheets): (c: Conversation) => boolean {
  const keys = new Set(client.numeros)
  return (c) => {
    if (c.line) return keys.has(c.line)
    const from = sheets?.convs.get(c.key)
    return from ? from.has(client.id) : keys.has(SEM_NUMERO)
  }
}

/** Há leads sem resposta que não vieram de planilha de cliente (só esses dependem de "Sem número" liberado)? */
export function hasLooseUnknown(convs: Conversation[], sheets?: ClientSheets): boolean {
  return convs.some((c) => !c.line && !c.isGroup && !sheets?.convs.has(c.key))
}

/** Chave de acesso (número ou SEM_NUMERO) → tipo de negócio do cliente que a tem liberada (heurísticas por conversa). */
export function segmentByKey(clients: Client[]): Map<string, Segmento> {
  const m = new Map<string, Segmento>()
  for (const c of clients) if (!c.pseudo) for (const n of c.numeros) if (!m.has(n)) m.set(n, c.segmento)
  return m
}

/** Chave de acesso (número ou SEM_NUMERO) → nome do cliente que a tem liberada, para as tabelas do administrador. */
export function clientNameByKey(clients: Client[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of clients) if (!c.pseudo) for (const n of c.numeros) if (!m.has(n)) m.set(n, c.nome)
  return m
}
