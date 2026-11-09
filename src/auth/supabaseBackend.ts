import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import type { AppUser, Backend, BasePublicada, FonteOnline, NovoUsuario, Papel, PerfilPatch, Publicacao } from './types'
import { joinCsv } from '../lib/access'
import { DEFAULT_SEGMENTO, asSegmento } from '../lib/segment'

const BUCKET = 'conversas'
const FUNCAO_ADMIN = 'admin-usuarios'

interface PerfilRow {
  id: string
  email: string
  nome: string
  papel: Papel
  empresa: string
  /** Ausente em bancos sem a migration 20261108173011_segmento.sql. */
  segmento?: string
  insights: string[] | null
  visao_geral: string[] | null
}

const PERFIL_COLS_SEM_SEGMENTO = 'id, email, nome, papel, empresa, insights, visao_geral'
const PERFIL_COLS = `${PERFIL_COLS_SEM_SEGMENTO}, segmento`

/** Banco ainda sem a coluna segmento: o painel segue funcionando, todo mundo como clínica (o comportamento de antes). */
const semSegmento = (e: { message: string } | null) => !!e && /segmento/.test(e.message) && /does not exist|schema cache/i.test(e.message)

/** Linha de perfis → campos do AppUser (sem os números, que vêm de outra tabela). */
const fromRow = ({ visao_geral, segmento, ...p }: PerfilRow): Omit<AppUser, 'numeros'> => ({ ...p, segmento: asSegmento(segmento), visaoGeral: visao_geral })

/** Patch do app → colunas de perfis. */
function toRow(patch: PerfilPatch): Record<string, unknown> {
  const { visaoGeral, ...rest } = patch
  return visaoGeral === undefined ? rest : { ...rest, visao_geral: visaoGeral }
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

/** Erro com que o Supabase devolve o login com Google (error_code / error_description na URL). */
function googleError(code: string, description: string): string {
  if (code === 'signup_disabled' || /signups? not allowed/i.test(description))
    return 'Este e-mail do Google não tem conta no painel. Peça ao administrador para criar sua conta com o mesmo e-mail e entre de novo.'
  if (/provider is not enabled|unsupported provider/i.test(description))
    return 'O login com Google está desligado no Supabase (Authentication → Sign In / Providers → Google).'
  if (/^(bad_oauth_state|bad_oauth_callback|flow_state_expired|flow_state_not_found)$/.test(code))
    return 'O login com Google expirou ou foi aberto em outra aba. Tente de novo.'
  return description ? `Não foi possível entrar com o Google: ${description}` : 'Não foi possível entrar com o Google. Tente de novo.'
}

const REDIRECT_ERROR_KEYS = ['error', 'error_code', 'error_description', 'sb']

/**
 * Lê (e tira da URL) o erro da volta do Google. O Supabase manda na query (PKCE) ou no #fragmento. Roda antes de criar o
 * cliente, que senão também leria o erro e apagaria a sessão à toa.
 */
function readRedirectError(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const from = url.searchParams.has('error') || url.searchParams.has('error_description') ? url.searchParams : hash.has('error') || hash.has('error_description') ? hash : null
  if (!from) return null
  const message = googleError(from.get('error_code') ?? '', from.get('error_description') ?? '')
  for (const k of REDIRECT_ERROR_KEYS) from.delete(k)
  if (from === hash) url.hash = hash.toString()
  window.history.replaceState(window.history.state, '', url.toString())
  return message
}

function dbError(e: { message: string }): Error {
  if (/fetch/i.test(e.message)) return new Error(OFFLINE)
  if (/row-level security|permission denied/i.test(e.message)) return new Error('Sem permissão para esta ação.')
  // Site novo com banco antigo: avisa qual migration falta em vez de "column ... does not exist".
  if (/column .*(empresa|insights).* does not exist/i.test(e.message))
    return new Error('O banco ainda não tem os campos de empresa e insights. Rode a migration 20261010120000_empresa_e_insights.sql no Supabase.')
  if (/column .*visao_geral.* does not exist/i.test(e.message))
    return new Error('O banco ainda não tem o campo da Visão geral por usuário. Rode a migration 20261010160000_visao_geral_por_usuario.sql no Supabase.')
  if (semSegmento(e))
    return new Error('O banco ainda não tem o campo do tipo de negócio. Rode a migration 20261108173011_segmento.sql no Supabase.')
  if (/relation .*fonte_planilha.* does not exist|fonte_planilha.*schema cache/i.test(e.message))
    return new Error('O banco ainda não tem a tabela da planilha online. Rode a migration 20261022120000_fonte_planilha.sql no Supabase.')
  return new Error(e.message)
}

const notFound = (e: { message: string }) => /not.?found/i.test(e.message)

export function createSupabaseBackend(url: string, key: string): Backend {
  let redirectError = readRedirectError()
  const sb = createClient(url, key, {
    // PKCE: a volta do Google traz só um código de uso único na URL, não o token da sessão.
    auth: { storageKey: 'rastreio-whatsapp.auth', persistSession: true, autoRefreshToken: true, flowType: 'pkce' },
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

  async function updatePerfil(id: string, patch: PerfilPatch): Promise<void> {
    const { data, error } = await sb.from('perfis').update(toRow(patch)).eq('id', id).select('id')
    if (error) throw dbError(error)
    if (!data.length) throw new Error('Sem permissão para alterar este usuário.')
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
      const lerPerfil = (cols: string) => sb.from('perfis').select(cols).eq('id', id).maybeSingle<PerfilRow>()
      const [primeiro, numeros] = await Promise.all([lerPerfil(PERFIL_COLS), sb.from('numeros_usuario').select('numero').eq('usuario_id', id)])
      const perfil = semSegmento(primeiro.error) ? await lerPerfil(PERFIL_COLS_SEM_SEGMENTO) : primeiro
      if (perfil.error) throw dbError(perfil.error)
      if (numeros.error) throw dbError(numeros.error)
      if (!perfil.data) throw new Error('Sua conta existe, mas não tem perfil de acesso. Peça ao administrador para recriá-la.')
      return { ...fromRow(perfil.data), numeros: numeros.data.map((r) => r.numero as string) }
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

    async googleEnabled() {
      // Mesmo endpoint público que o Supabase usa para listar os provedores ligados; na falha, esconde o botão.
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: key } })
        if (!res.ok) return false
        const settings = (await res.json()) as { external?: Record<string, boolean> }
        return settings.external?.google === true
      } catch {
        return false
      }
    },

    async signInWithGoogle() {
      // Só entra quem já tem conta (o cadastro aberto fica desligado): o Supabase liga o Google à conta de mesmo e-mail.
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw loginError(error)
    },

    takeLoginRedirectError() {
      const e = redirectError
      redirectError = null
      return e
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
      const lerPerfis = (cols: string) => sb.from('perfis').select(cols).order('nome').returns<PerfilRow[]>()
      const [primeiro, numeros] = await Promise.all([lerPerfis(PERFIL_COLS), sb.from('numeros_usuario').select('usuario_id, numero')])
      const perfis = semSegmento(primeiro.error) ? await lerPerfis(PERFIL_COLS_SEM_SEGMENTO) : primeiro
      if (perfis.error) throw dbError(perfis.error)
      if (numeros.error) throw dbError(numeros.error)
      const byUser = new Map<string, string[]>()
      for (const r of numeros.data) byUser.set(r.usuario_id, [...(byUser.get(r.usuario_id) ?? []), r.numero])
      return perfis.data.map((p): AppUser => ({ ...fromRow(p), numeros: byUser.get(p.id) ?? [] }))
    },

    async createUser(u: NovoUsuario) {
      const { visaoGeral, segmento, ...rest } = u
      // Clínica é o padrão da coluna: não manda, para criar conta funcionar mesmo antes da migration do segmento.
      const extra = segmento === DEFAULT_SEGMENTO ? {} : { segmento }
      const criado = (await callAdmin({ acao: 'criar', ...rest, ...extra, visao_geral: visaoGeral })) as { id?: string } | null
      // Edge Function publicada antes do campo existir ignora o segmento: grava direto no perfil (o admin pode).
      if (segmento !== DEFAULT_SEGMENTO && criado?.id) await updatePerfil(criado.id, { segmento })
    },

    updateUser: updatePerfil,

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
      const [baseRes, fonteRes] = await Promise.all([
        sb.from('base_conversas').select('versao, nome_arquivo, numeros, ultima_mensagem, publicada_em').maybeSingle(),
        sb.from('fonte_planilha').select('url, intervalo_seg, definida_em').maybeSingle(),
      ])
      if (baseRes.error) throw dbError(baseRes.error)
      // Banco sem a migration da planilha online: segue só com o arquivo publicado.
      const semTabela = !!fonteRes.error && /does not exist|schema cache/i.test(fonteRes.error.message)
      if (fonteRes.error && !semTabela) throw dbError(fonteRes.error)
      const fonte: FonteOnline | null = fonteRes.data
        ? { url: fonteRes.data.url, intervaloSeg: fonteRes.data.intervalo_seg, definidaEm: fonteRes.data.definida_em ? new Date(fonteRes.data.definida_em) : null }
        : null
      const base = baseRes.data
      // Com planilha online, ninguém baixa os arquivos do Storage: cada navegador lê o CSV do link.
      if (fonte) return { text: '', fileName: '', clinicPhones: [], refTime: null, publishedAt: null, fonte }
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
        fonte: null,
      }
    },

    async setSource(fonte) {
      if (!fonte) {
        const { error } = await sb.from('fonte_planilha').delete().eq('id', true)
        if (error) throw dbError(error)
        return
      }
      const userId = await uid()
      const { error } = await sb.from('fonte_planilha').upsert({
        id: true,
        url: fonte.url,
        intervalo_seg: fonte.intervaloSeg,
        definida_em: new Date().toISOString(),
        definida_por: userId,
      })
      if (error) throw dbError(error)
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
