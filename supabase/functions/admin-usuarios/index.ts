// Criar conta, redefinir senha e excluir conta: operações que exigem a chave de serviço do Supabase,
// por isso ficam aqui e não no navegador. Só administradores (perfis.papel = 'admin') conseguem chamar.
//
// Corpo (POST, JSON):
//   { acao: 'criar', email, senha, nome, papel: 'admin' | 'usuario', numeros: string[], empresa?: string,
//     insights?: string[] | null, visao_geral?: string[] | null }
//   { acao: 'senha', id, senha }
//   { acao: 'excluir', id }
import { createClient } from 'npm:@supabase/supabase-js@2'

const MIN_SENHA = 8
const NUMERO_RE = /^([0-9]+|sem-numero)$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INSIGHT_RE = /^[a-z0-9-]{1,40}$/
const MAX_EMPRESA = 80

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function erro(mensagem: string, status = 400): Response {
  return json({ erro: mensagem }, status)
}

/** Mensagens do Supabase Auth em português; o resto passa como veio. */
function traduzir(msg: string): string {
  if (/already (been )?registered|already exists/i.test(msg)) return 'Já existe uma conta com este e-mail.'
  if (/password should be at least/i.test(msg)) return `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`
  if (/weak password|password is known/i.test(msg)) return 'Senha fraca demais. Use uma senha mais longa ou menos comum.'
  if (/invalid email|unable to validate email/i.test(msg)) return 'E-mail inválido.'
  if (/user not found/i.test(msg)) return 'Usuário não encontrado.'
  return msg
}

function chaveDeServico(): string {
  const legada = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legada) return legada
  // Projetos só com as chaves novas (sb_secret_...) recebem SUPABASE_SECRET_KEYS = {"default": "..."}.
  const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  return novas.default ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return erro('Método não suportado.', 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, chaveDeServico(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Quem está chamando? O token é o access token da sessão do navegador.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return erro('Faça login novamente.', 401)
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return erro('Sessão expirada. Faça login novamente.', 401)
  const chamador = auth.user.id
  const { data: perfil } = await admin.from('perfis').select('papel').eq('id', chamador).maybeSingle()
  if (perfil?.papel !== 'admin') return erro('Apenas administradores podem gerenciar usuários.', 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return erro('Requisição inválida.')
  }

  if (body.acao === 'criar') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const senha = String(body.senha ?? '')
    const nome = String(body.nome ?? '').trim()
    const papel = body.papel === 'admin' ? 'admin' : 'usuario'
    const numeros = Array.isArray(body.numeros) ? [...new Set(body.numeros.map(String))] : []
    const empresa = String(body.empresa ?? '').trim()
    // null (ou ausente) = todos os insights; lista = só os escolhidos pelo administrador.
    const insights = Array.isArray(body.insights) ? [...new Set(body.insights.map(String))] : null
    const visaoGeral = Array.isArray(body.visao_geral) ? [...new Set(body.visao_geral.map(String))] : null
    if (!EMAIL_RE.test(email)) return erro('E-mail inválido.')
    if (senha.length < MIN_SENHA) return erro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    if (!nome) return erro('Informe o nome.')
    if (numeros.some((n) => !NUMERO_RE.test(n))) return erro('Número inválido na lista de números liberados.')
    if (empresa.length > MAX_EMPRESA) return erro(`O nome da empresa pode ter até ${MAX_EMPRESA} caracteres.`)
    if (insights?.some((i) => !INSIGHT_RE.test(i))) return erro('Insight inválido na lista de insights.')
    if (visaoGeral?.some((i) => !INSIGHT_RE.test(i))) return erro('Bloco inválido na lista da Visão geral.')

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (error || !data.user) return erro(traduzir(error?.message ?? 'Não foi possível criar a conta.'))
    const id = data.user.id

    // O perfil (papel 'usuario') é criado pelo gatilho on_auth_user_created; aqui só ajustamos.
    const { error: perfilError } = await admin.from('perfis').update({ nome, papel, empresa, insights, visao_geral: visaoGeral }).eq('id', id)
    const { error: numerosError } = numeros.length
      ? await admin.from('numeros_usuario').insert(numeros.map((numero) => ({ usuario_id: id, numero })))
      : { error: null }
    if (perfilError || numerosError) {
      await admin.auth.admin.deleteUser(id)
      return erro(`Não foi possível salvar o perfil: ${(perfilError ?? numerosError)!.message}`, 500)
    }
    return json({ id })
  }

  if (body.acao === 'senha') {
    const id = String(body.id ?? '')
    const senha = String(body.senha ?? '')
    if (!id) return erro('Usuário não informado.')
    if (senha.length < MIN_SENHA) return erro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha })
    if (error) return erro(traduzir(error.message))
    return json({ ok: true })
  }

  if (body.acao === 'excluir') {
    const id = String(body.id ?? '')
    if (!id) return erro('Usuário não informado.')
    if (id === chamador) return erro('Você não pode excluir a própria conta.')
    const { error } = await admin.auth.admin.deleteUser(id)
    // O gatilho proteger_ultimo_admin barra a exclusão do último administrador.
    if (error) return erro(/pelo menos um administrador/.test(error.message) ? 'É preciso manter pelo menos um administrador.' : traduzir(error.message))
    return json({ ok: true })
  }

  return erro('Ação desconhecida.')
})
