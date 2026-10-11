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
  insights: string[] | null
  visaoGeral: string[] | null
}

/** O que o administrador edita direto no perfil (sem a chave de serviço). */
export type PerfilPatch = Partial<Pick<AppUser, 'nome' | 'papel' | 'empresa' | 'insights' | 'visaoGeral'>>

/** Planilha publicada, já recortada para quem está logado. */
export interface BasePublicada {
  text: string
  fileName: string
  /** Todos os números da base, inclusive os que o usuário não vê (as heurísticas dependem deles). */
  clinicPhones: string[]
  /** Última mensagem da base inteira: referência de espera igual para todos. */
  refTime: Date | null
  publishedAt: Date | null
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

  /** null = nenhuma planilha publicada ainda. */
  loadBase(user: AppUser): Promise<BasePublicada | null>
  publishBase(p: Publicacao): Promise<void>
}
