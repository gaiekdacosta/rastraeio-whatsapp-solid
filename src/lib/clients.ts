import type { AppUser } from '../auth/types'

/*
 * Cliente = a empresa de uma conta da aba Usuários, com todos os números liberados para ela. É o que o
 * administrador escolhe no topo do painel: ao trocar de cliente, todas as abas passam a mostrar só as
 * conversas dos números dele. Não existe tabela própria: tudo vem das contas e dos números liberados.
 */

export const SEM_CLIENTE = 'sem-cliente'

export interface Client {
  id: string
  nome: string
  /** Chaves de acesso liberadas: números (só dígitos) e/ou SEM_NUMERO. */
  numeros: string[]
  /** Contas que pertencem ao cliente (nome ou e-mail). */
  usuarios: string[]
  /** "Sem cliente": chaves da planilha que nenhuma conta tem liberadas. */
  pseudo?: boolean
}

function keyOf(u: AppUser): { id: string; nome: string } {
  const empresa = u.empresa.trim()
  if (empresa) return { id: `cliente:${empresa.toLocaleLowerCase('pt-BR')}`, nome: empresa }
  return { id: `conta:${u.id}`, nome: u.nome.trim() || u.email }
}

/**
 * Agrupa as contas comuns por empresa (conta sem empresa vira um cliente com o próprio nome). `baseKeys`
 * são as chaves de acesso que existem na planilha publicada (números e, se houver leads sem resposta,
 * SEM_NUMERO): as que nenhuma conta tem liberadas viram o pseudocliente "Sem cliente".
 */
export function buildClients(users: AppUser[], baseKeys: string[]): Client[] {
  const map = new Map<string, Client>()
  for (const u of users) {
    if (u.papel !== 'usuario') continue
    const { id, nome } = keyOf(u)
    const c = map.get(id) ?? { id, nome, numeros: [], usuarios: [] }
    c.numeros = [...new Set([...c.numeros, ...u.numeros])]
    c.usuarios.push(u.nome.trim() || u.email)
    map.set(id, c)
  }
  const clients = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const taken = new Set(clients.flatMap((c) => c.numeros))
  const loose = baseKeys.filter((k) => !taken.has(k))
  if (loose.length) clients.push({ id: SEM_CLIENTE, nome: 'Sem cliente', numeros: loose, usuarios: [], pseudo: true })
  return clients
}

/** Chave de acesso (número ou SEM_NUMERO) → nome do cliente que a tem liberada, para as tabelas do administrador. */
export function clientNameByKey(clients: Client[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of clients) if (!c.pseudo) for (const n of c.numeros) if (!m.has(n)) m.set(n, c.nome)
  return m
}
