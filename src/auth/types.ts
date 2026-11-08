import type { Segmento } from '../lib/segment'

export type Papel = 'admin' | 'usuario'

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: 'Administrador',
  usuario: 'Usuário',
}

export const MIN_SENHA = 8

export interface AppUser {
  id: string
  email: string
  nome: string
  papel: Papel
  /** Números da empresa liberados (só dígitos) e/ou SEM_NUMERO. Administradores veem todos. */
  numeros: string[]
  /** Empresa do usuário, mostrada no topo do painel. Vazio = só a marca Solid. */
  empresa: string
  /** Tipo de negócio da empresa (clínica, loja…): muda os termos e as heurísticas do painel. */
  segmento: Segmento
  /** Blocos da aba Insights escolhidos pelo administrador (ids de lib/insights). null = todos. */
  insights: string[] | null
  /** Blocos da aba Visão geral escolhidos pelo administrador (ids de lib/overview). null = todos. */
  visaoGeral: string[] | null
}

export interface NovoUsuario {
  email: string
  senha: string
  nome: string
  papel: Papel
  numeros: string[]
  empresa: string
  segmento: Segmento
  insights: string[] | null
  visaoGeral: string[] | null
}

/** O que o administrador edita direto no perfil (sem a chave de serviço). */
export type PerfilPatch = Partial<Pick<AppUser, 'nome' | 'papel' | 'empresa' | 'segmento' | 'insights' | 'visaoGeral'>>

/** Planilha online: o dashboard lê o CSV deste link em intervalos, direto do navegador de cada pessoa. */
export interface FonteOnline {
  url: string
  intervaloSeg: number
  definidaEm: Date | null
}

/** Planilha publicada, já recortada para quem está logado. */
export interface BasePublicada {
  text: string
  fileName: string
  /** Todos os números da base, inclusive os que o usuário não vê (as heurísticas dependem deles). */
  clinicPhones: string[]
  /** Última mensagem da base inteira: referência de espera igual para todos. */
  refTime: Date | null
  publishedAt: Date | null
  /** Quando definida, vale a planilha online e `text` vem vazio: o app lê o CSV do link. */
  fonte: FonteOnline | null
}

export interface Publicacao {
  text: string
  fileName: string
  clinicPhones: string[]
  refTime: Date
  /** Número da empresa (ou SEM_NUMERO) → CSV só com as conversas dele. */
  parts: Map<string, string>
}

/** O que o app precisa do servidor. Implementado pelo Supabase e, só em desenvolvimento, por um modo demonstração local. */
export interface Backend {
  readonly kind: 'supabase' | 'demo'
  currentUser(): Promise<AppUser | null>
  /** Login/logout (inclusive em outra aba) ou sessão expirada. */
  onAuthChange(cb: () => void): () => void
  signIn(email: string, senha: string): Promise<void>
  signOut(): Promise<void>
  changeOwnPassword(senha: string): Promise<void>

  listUsers(): Promise<AppUser[]>
  createUser(u: NovoUsuario): Promise<void>
  updateUser(id: string, patch: PerfilPatch): Promise<void>
  setNumbers(id: string, numeros: string[]): Promise<void>
  setPassword(id: string, senha: string): Promise<void>
  deleteUser(id: string): Promise<void>

  /** null = nenhuma planilha publicada nem planilha online definida ainda. */
  loadBase(user: AppUser): Promise<BasePublicada | null>
  publishBase(p: Publicacao): Promise<void>
  /** Define (ou, com null, desliga) a planilha online que todos passam a ler. Só administradores. */
  setSource(fonte: Pick<FonteOnline, 'url' | 'intervaloSeg'> | null): Promise<void>
}
