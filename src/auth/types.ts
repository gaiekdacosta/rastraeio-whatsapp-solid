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

/**
 * Planilha online: o dashboard lê o CSV deste link em intervalos, direto do navegador de cada pessoa.
 * Cada planilha é de um cliente (empresa das contas) ou, com empresa vazia, de todos os clientes.
 */
export interface FonteOnline {
  id: string
  /** Empresa do cliente dono da planilha (como em AppUser.empresa); '' = planilha de todos os clientes. */
  empresa: string
  url: string
  intervaloSeg: number
  definidaEm: Date | null
}

/** Planilha nova (sem id) ou alteração de uma existente (com id). */
export type FonteInput = Pick<FonteOnline, 'empresa' | 'url' | 'intervaloSeg'> & { id?: string }

/** Planilha publicada, já recortada para quem está logado. */
export interface BasePublicada {
  text: string
  fileName: string
  /** Todos os números da base, inclusive os que o usuário não vê (as heurísticas dependem deles). */
  clinicPhones: string[]
  /** Última mensagem da base inteira: referência de espera igual para todos. */
  refTime: Date | null
  publishedAt: Date | null
  /**
   * Planilhas online que quem está logado pode ler (no Supabase, o banco já esconde as de outros clientes).
   * Com alguma, ela vale no lugar do arquivo e `text` vem vazio: o app lê o CSV dos links.
   */
  fontes: FonteOnline[]
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
  /** Login com Google ligado no servidor (no Supabase: Authentication → Sign In / Providers → Google)? */
  googleEnabled(): Promise<boolean>
  /** Sai do site para o Google; a volta chega logada ou com um erro (ver takeLoginRedirectError). */
  signInWithGoogle(): Promise<void>
  /** Erro com que o Supabase devolveu o login com Google (ex.: e-mail sem conta). Lido da URL uma vez só. */
  takeLoginRedirectError(): string | null
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
  /** Inclui ou altera uma planilha online (de um cliente ou de todos). Só administradores. */
  saveSource(fonte: FonteInput): Promise<FonteOnline>
  /** Remove uma planilha online. Só administradores. */
  removeSource(id: string): Promise<void>
}
