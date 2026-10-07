import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import type { AppUser, Backend, BasePublicada, NovoUsuario, Papel, Publicacao } from './types'
import { joinCsv } from '../lib/access'

const BUCKET = 'conversas'
const FUNCAO_ADMIN = 'admin-usuarios'

interface PerfilRow {
  id: string
  email: string
  nome: string
  papel: Papel
}

const OFFLINE = 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.'

function loginError(e: { code?: string; message: string; name?: string }): Error {
  if (e.code === 'invalid_credentials' || /invalid login credentials/i.test(e.message)) return new Error('E-mail ou senha incorretos.')
  if (e.code === 'email_not_confirmed') return new Error('Este e-mail ainda não foi confirmado no Supabase.')
  if (e.code === 'over_request_rate_limit') return new Error('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.')
  if (e.code === 'email_provider_disabled') return new Error('O login por e-mail está desligado no Supabase (Authentication → Sign In / Providers → Email).')
  if (e.name === 'AuthRetryableFetchError' || /fetch/i.test(e.message)) return new Error(OFFLINE)
  return new Error(e.message)
}

function dbError(e: { message: string }): Error {
  if (/fetch/i.test(e.message)) return new Error(OFFLINE)
  if (/row-level security|permission denied/i.test(e.message)) return new Error('Sem permissão para esta ação.')
  return new Error(e.message)
}

const notFound = (e: { message: string }) => /not.?found/i.test(e.message)

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb = createClient(url, key, {
    auth: { storageKey: 'rastreio-whatsapp.auth', persistSession: true, autoRefreshToken: true },
  })

  async function uid(): Promise<string> {
    const { data } = await sb.auth.getSession()
    if (!data.session) throw new Error('Sessão expirada. Entre de novo.')
    return data.session.user.id
  }

  async function callAdmin(body: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await sb.functions.invoke(FUNCAO_ADMIN, { body })
    if (!error) return data
    if (error instanceof FunctionsHttpError) {
      const payload = await (error.context as Response).json().catch(() => null)
      if (payload?.erro) throw new Error(payload.erro)
      if ((error.context as Response).status === 404) throw new Error(`A Edge Function ${FUNCAO_ADMIN} não foi publicada no Supabase.`)
    }
    throw new Error(`A Edge Function ${FUNCAO_ADMIN} não respondeu. Confira se ela foi publicada (supabase functions deploy ${FUNCAO_ADMIN}).`)
  }

  async function removeOldVersions(current: string): Promise<void> {
    const store = sb.storage.from(BUCKET)
    const { data: roots } = await store.list('', { limit: 1000 })
    for (const root of roots ?? []) {
      if (root.name === current) continue
      const paths: string[] = []
      const { data: top } = await store.list(root.name, { limit: 1000 })
      for (const item of top ?? []) {
        if (item.id) paths.push(`${root.name}/${item.name}`)
        else {
          const { data: inner } = await store.list(`${root.name}/${item.name}`, { limit: 1000 })
          for (const f of inner ?? []) paths.push(`${root.name}/${item.name}/${f.name}`)
        }
      }
      if (paths.length) await store.remove(paths)
    }
  }

  return {
    kind: 'supabase',

    async currentUser() {
      const { data } = await sb.auth.getSession()
      const session = data.session
      if (!session) return null
      const id = session.user.id
      const [perfil, numeros] = await Promise.all([
        sb.from('perfis').select('id, email, nome, papel').eq('id', id).maybeSingle<PerfilRow>(),
        sb.from('numeros_usuario').select('numero').eq('usuario_id', id),
      ])
      if (perfil.error) throw dbError(perfil.error)
      if (numeros.error) throw dbError(numeros.error)
      if (!perfil.data) throw new Error('Sua conta existe, mas não tem perfil de acesso. Peça ao administrador para recriá-la.')
      return { ...perfil.data, numeros: numeros.data.map((r) => r.numero as string) }
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        // Fora do callback: chamar o Supabase dentro dele trava o cliente.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(cb, 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) throw loginError(error)
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async changeOwnPassword(senha) {
      const { error } = await sb.auth.updateUser({ password: senha })
      if (!error) return
      if (error.code === 'same_password') throw new Error('A nova senha precisa ser diferente da atual.')
      if (error.code === 'weak_password') throw new Error('Senha fraca demais. Use uma senha mais longa ou menos comum.')
      throw loginError(error)
    },

    async listUsers() {
      const [perfis, numeros] = await Promise.all([
        sb.from('perfis').select('id, email, nome, papel').order('nome').returns<PerfilRow[]>(),
        sb.from('numeros_usuario').select('usuario_id, numero'),
      ])
      if (perfis.error) throw dbError(perfis.error)
      if (numeros.error) throw dbError(numeros.error)
      const byUser = new Map<string, string[]>()
      for (const r of numeros.data) byUser.set(r.usuario_id, [...(byUser.get(r.usuario_id) ?? []), r.numero])
      return perfis.data.map((p): AppUser => ({ ...p, numeros: byUser.get(p.id) ?? [] }))
    },

    async createUser(u: NovoUsuario) {
      await callAdmin({ acao: 'criar', ...u })
    },

    async updateUser(id, patch) {
      const { data, error } = await sb.from('perfis').update(patch).eq('id', id).select('id')
      if (error) throw dbError(error)
      if (!data.length) throw new Error('Sem permissão para alterar este usuário.')
    },

    async setNumbers(id, numeros) {
      const { error } = await sb.rpc('definir_numeros_usuario', { p_usuario: id, p_numeros: numeros })
      if (error) throw dbError(error)
    },

    async setPassword(id, senha) {
      await callAdmin({ acao: 'senha', id, senha })
    },

    async deleteUser(id) {
      await callAdmin({ acao: 'excluir', id })
    },

    async loadBase(user): Promise<BasePublicada | null> {
      const { data: base, error } = await sb
        .from('base_conversas')
        .select('versao, nome_arquivo, numeros, ultima_mensagem, publicada_em')
        .maybeSingle()
      if (error) throw dbError(error)
      if (!base) return null
      // Admin baixa a planilha inteira; usuário, um arquivo por número liberado (o Storage recusa os demais).
      const paths = user.papel === 'admin' ? [`${base.versao}/completa.csv`] : user.numeros.map((n) => `${base.versao}/numeros/${n}.csv`)
      const texts = await Promise.all(
        paths.map(async (path) => {
          const { data, error: dlError } = await sb.storage.from(BUCKET).download(path)
          if (dlError) {
            if (notFound(dlError)) return '' // número sem conversas nesta planilha
            throw dbError(dlError)
          }
          return data.text()
        }),
      )
      return {
        text: joinCsv(texts.filter(Boolean)),
        fileName: base.nome_arquivo,
        clinicPhones: base.numeros ?? [],
        refTime: base.ultima_mensagem ? new Date(base.ultima_mensagem) : null,
        publishedAt: base.publicada_em ? new Date(base.publicada_em) : null,
      }
    },

    async publishBase(p: Publicacao) {
      const userId = await uid()
      // Cada publicação vai para uma pasta nova; a troca para os usuários acontece de uma vez, ao gravar base_conversas.
      const versao = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
      const store = sb.storage.from(BUCKET)
      const files: [string, string][] = [[`${versao}/completa.csv`, p.text], ...[...p.parts].map(([k, t]): [string, string] => [`${versao}/numeros/${k}.csv`, t])]
      for (const [path, text] of files) {
        const { error } = await store.upload(path, new Blob([text], { type: 'text/csv' }), { contentType: 'text/csv', upsert: true })
        if (error) throw dbError(error)
      }
      const { error } = await sb.from('base_conversas').upsert({
        id: true,
        versao,
        nome_arquivo: p.fileName,
        numeros: p.clinicPhones,
        ultima_mensagem: p.refTime.toISOString(),
        publicada_em: new Date().toISOString(),
        publicada_por: userId,
      })
      if (error) throw dbError(error)
      await removeOldVersions(versao).catch(() => undefined) // limpeza; se falhar, sobra só arquivo antigo
    },
  }
}
