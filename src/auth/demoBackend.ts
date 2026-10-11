import type { AppUser, Backend, BasePublicada, Papel } from './types'

/*
 * Modo demonstração: só existe no `npm run dev` sem Supabase configurado, para ver login, perfis e o
 * controle de números sem depender do servidor. Contas e senhas ficam em texto puro no localStorage
 * e a planilha vem de data/ (servida pelo Vite em /__demo/conversas.csv). Nada disso vai para o build.
 */

const USERS_KEY = 'rastreio-whatsapp.demo.users'
const SESSION_KEY = 'rastreio-whatsapp.demo.session'

interface DemoUser extends AppUser {
  senha: string
}

export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.local', senha: 'admin1234', papel: 'admin' as Papel },
  { email: 'usuario@demo.local', senha: 'usuario1234', papel: 'usuario' as Papel },
]

const SEED: DemoUser[] = [
  { id: 'demo-admin', nome: 'Administrador (demo)', numeros: [], empresa: '', insights: null, visaoGeral: null, ...DEMO_ACCOUNTS[0] },
  { id: 'demo-usuario', nome: 'Usuário (demo)', numeros: [], empresa: 'Império 085', insights: null, visaoGeral: null, ...DEMO_ACCOUNTS[1] },
]

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* armazenamento indisponível: vale só nesta aba */
  }
}

// Contas salvas antes dos campos empresa, insights e visaoGeral existirem: sem empresa, vendo tudo.
const strip = ({ senha: _senha, ...u }: DemoUser): AppUser => ({ ...u, empresa: u.empresa ?? '', insights: u.insights ?? null, visaoGeral: u.visaoGeral ?? null })

export function createDemoBackend(): Backend {
  let users: DemoUser[] = read(USERS_KEY, SEED)
  const listeners = new Set<() => void>()
  let published: BasePublicada | null = null // publicação vale até recarregar a página

  const save = () => write(USERS_KEY, users)
  const notify = () => listeners.forEach((cb) => cb())
  const sessionId = () => read<string | null>(SESSION_KEY, null)
  const find = (id: string) => {
    const u = users.find((x) => x.id === id)
    if (!u) throw new Error('Usuário não encontrado.')
    return u
  }
  const requireAdmin = () => {
    const me = users.find((u) => u.id === sessionId())
    if (me?.papel !== 'admin') throw new Error('Apenas administradores podem fazer isso.')
    return me
  }
  const keepOneAdmin = (exceptId: string) => {
    if (!users.some((u) => u.papel === 'admin' && u.id !== exceptId)) throw new Error('É preciso manter pelo menos um administrador.')
  }

  window.addEventListener('storage', (e) => {
    if (e.key === USERS_KEY) users = read(USERS_KEY, SEED)
    if (e.key === SESSION_KEY || e.key === USERS_KEY) notify()
  })

  return {
    kind: 'demo',

    async currentUser() {
      const id = sessionId()
      const u = id ? users.find((x) => x.id === id) : undefined
      return u ? strip(u) : null
    },

    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    async signIn(email, senha) {
      const u = users.find((x) => x.email === email.trim().toLowerCase())
      if (!u || u.senha !== senha) throw new Error('E-mail ou senha incorretos.')
      write(SESSION_KEY, u.id)
      notify()
    },

    async signOut() {
      write(SESSION_KEY, null)
      notify()
    },

    async changeOwnPassword(senha) {
      const id = sessionId()
      if (!id) throw new Error('Sessão expirada. Entre de novo.')
      find(id).senha = senha
      save()
    },

    async listUsers() {
      requireAdmin()
      return users.map(strip).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },

    async createUser(n) {
      requireAdmin()
      const email = n.email.trim().toLowerCase()
      if (users.some((u) => u.email === email)) throw new Error('Já existe uma conta com este e-mail.')
      users = [
        ...users,
        {
          id: `demo-${Date.now().toString(36)}`,
          email,
          senha: n.senha,
          nome: n.nome.trim(),
          papel: n.papel,
          numeros: [...new Set(n.numeros)],
          empresa: n.empresa.trim(),
          insights: n.insights && [...new Set(n.insights)],
          visaoGeral: n.visaoGeral && [...new Set(n.visaoGeral)],
        },
      ]
      save()
    },

    async updateUser(id, patch) {
      requireAdmin()
      const u = find(id)
      if (patch.papel && patch.papel !== 'admin' && u.papel === 'admin') keepOneAdmin(id)
      Object.assign(u, patch)
      save()
    },

    async setNumbers(id, numeros) {
      requireAdmin()
      find(id).numeros = [...new Set(numeros)]
      save()
    },

    async setPassword(id, senha) {
      requireAdmin()
      find(id).senha = senha
      save()
    },

    async deleteUser(id) {
      const me = requireAdmin()
      if (id === me.id) throw new Error('Você não pode excluir a própria conta.')
      if (find(id).papel === 'admin') keepOneAdmin(id)
      users = users.filter((u) => u.id !== id)
      save()
    },

    async loadBase() {
      if (published) return published
      const res = await fetch('/__demo/conversas.csv')
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Não foi possível ler a planilha de demonstração (HTTP ${res.status}).`)
      // Usuário comum recebe a planilha inteira; o recorte por número acontece no App (no Supabase, no servidor).
      return {
        text: await res.text(),
        fileName: decodeURIComponent(res.headers.get('X-File-Name') ?? 'conversas.csv'),
        clinicPhones: [],
        refTime: null,
        publishedAt: null,
      }
    },

    async publishBase(p) {
      requireAdmin()
      published = { text: p.text, fileName: p.fileName, clinicPhones: p.clinicPhones, refTime: p.refTime, publishedAt: new Date() }
    },
  }
}
