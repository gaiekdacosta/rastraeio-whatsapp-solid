import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleHelp, Copy, LayoutDashboard, Pencil, Phone, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useSession } from '../auth/AuthProvider'
import { MIN_SENHA, PAPEL_LABEL } from '../auth/types'
import type { AppUser, Papel, PerfilPatch } from '../auth/types'
import { SEM_NUMERO } from '../lib/access'
import { fullPanel, panelDetail, panelOf, panelSummary, storePanel } from '../lib/panel'
import type { PanelSelection } from '../lib/panel'
import { fmtInt, fmtLine } from '../lib/format'
import { useLineNames } from '../lineNames'
import { Modal } from '../components/Modal'
import { PasswordField } from '../components/PasswordField'
import { PanelPicker } from '../components/PanelPicker'
import { initials } from '../components/UserMenu'

interface Props {
  /** Números da empresa encontrados na planilha, do mais ao menos ativo. */
  lines: string[]
  /** A planilha tem conversas que não dá para ligar a um número (leads sem resposta). */
  hasUnknownLine: boolean
  /** Conversas de leads por chave de acesso (número ou SEM_NUMERO), na planilha inteira. */
  counts: Map<string, number>
  attendants: Map<string, string[]>
  hasBase: boolean
  /** Avisa o App quando a lista de contas muda (o filtro Clientes do topo nasce dela). */
  onUsersChanged?: (users: AppUser[]) => void
}

interface Column {
  key: string
  title: string
  sub: string
  count: number | null
  stale: boolean
}

export function UsersView({ lines, hasUnknownLine, counts, attendants, hasBase, onUsersChanged }: Props) {
  const { backend, user: me, refresh: refreshMe } = useSession()
  const { label, isRenamed } = useLineNames()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [pickingPanel, setPickingPanel] = useState<AppUser | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await backend.listUsers()
      setUsers(list)
      onUsersChanged?.(list)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [backend, onUsersChanged])

  useEffect(() => {
    void reload()
  }, [reload])

  const columns = useMemo<Column[]>(() => {
    const assigned = new Set((users ?? []).flatMap((u) => u.numeros))
    const cols: Column[] = lines.map((l) => ({
      key: l,
      title: label(l),
      sub: isRenamed(l) ? fmtLine(l) : (attendants.get(l) ?? []).slice(0, 2).join(', ') || 'Sem atendente identificado',
      count: counts.get(l) ?? 0,
      stale: false,
    }))
    if (hasUnknownLine || assigned.has(SEM_NUMERO))
      cols.push({ key: SEM_NUMERO, title: 'Sem número', sub: 'Leads que nunca receberam resposta', count: hasBase ? (counts.get(SEM_NUMERO) ?? 0) : null, stale: false })
    // Números liberados antes que não estão na planilha atual: aparecem para o admin poder tirar.
    for (const n of assigned)
      if (n !== SEM_NUMERO && !lines.includes(n)) cols.push({ key: n, title: label(n), sub: 'Fora da planilha atual', count: null, stale: true })
    return cols
  }, [users, lines, hasUnknownLine, counts, attendants, hasBase, label, isRenamed])

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id))
    setActionError(null)
    try {
      await action()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
      await reload()
    }
  }

  const toggleNumber = (u: AppUser, key: string) => {
    const numeros = u.numeros.includes(key) ? u.numeros.filter((n) => n !== key) : [...u.numeros, key]
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, numeros } : x)) ?? null) // otimista; reload corrige se falhar
    void run(u.id, () => backend.setNumbers(u.id, numeros))
  }

  const setAll = (u: AppUser, on: boolean) => {
    const numeros = on ? columns.filter((c) => !c.stale).map((c) => c.key) : []
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, numeros } : x)) ?? null)
    void run(u.id, () => backend.setNumbers(u.id, numeros))
  }

  const changePapel = (u: AppUser, papel: Papel) => void run(u.id, () => backend.updateUser(u.id, { papel }))

  const savePanel = (u: AppUser, selected: PanelSelection) => {
    const patch = storePanel(selected)
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, ...patch } : x)) ?? null) // otimista; reload corrige se falhar
    void run(u.id, () => backend.updateUser(u.id, patch))
  }

  const remove = (u: AppUser) => {
    if (!window.confirm(`Excluir a conta de ${u.nome || u.email} (${u.email})? A pessoa perde o acesso na hora. Esta ação não pode ser desfeita.`)) return
    void run(u.id, () => backend.deleteUser(u.id))
  }

  const usersPerColumn = (key: string) => (users ?? []).filter((u) => u.papel === 'admin' || u.numeros.includes(key)).length

  return (
    <div className="grid">
      <section className="card" aria-label="Usuários e números liberados">
        <div className="card-head">
          <div>
            <h3 className="card-title">Usuários e números liberados</h3>
            <p className="card-sub">
              Marque os números da planilha que cada usuário pode ver e, em <b>Painel</b>, escolha os blocos da Visão geral e dos Insights que aparecem para
              ele. Ele só recebe as conversas desses números; administradores veem tudo. A mudança vale no próximo acesso da pessoa (ou ao recarregar a página).
            </p>
          </div>
          <div className="card-actions">
            <button type="button" className="btn ghost sm" onClick={() => void reload()} title="Atualizar lista">
              <RefreshCw size={13} aria-hidden /> Atualizar
            </button>
          </div>
        </div>

        {!hasBase && (
          <div className="callout warn" style={{ marginBottom: 12 }}>
            Nenhuma planilha publicada ainda. Publique o CSV na aba <b>Dados</b> para os números aparecerem aqui.
          </div>
        )}
        {loadError && (
          <div className="callout warn" role="alert" style={{ marginBottom: 12 }}>
            Não foi possível carregar os usuários: {loadError}
          </div>
        )}
        {actionError && (
          <div className="callout warn" role="alert" style={{ marginBottom: 12 }}>
            {actionError}
          </div>
        )}

        {users === null && !loadError ? (
          <div className="empty">Carregando usuários…</div>
        ) : (
          <div className="table-scroll access-scroll">
            <table className="table access-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th title="Blocos da Visão geral e da aba Insights que a pessoa vê">Painel</th>
                  {columns.map((c) => (
                    <th key={c.key} className={`access-col${c.stale ? ' stale' : ''}`} title={c.key === SEM_NUMERO ? 'A planilha não diz para qual número escreveram os leads que nunca receberam resposta' : fmtLine(c.key)}>
                      <span className="access-col-title">
                        {c.key === SEM_NUMERO ? <CircleHelp size={13} aria-hidden /> : <Phone size={13} aria-hidden />}
                        {c.title}
                      </span>
                      <span className="access-col-sub">{c.sub}</span>
                      {c.count !== null && <span className="access-col-sub">{fmtInt(c.count)} conversas</span>}
                    </th>
                  ))}
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => {
                  const isMe = u.id === me.id
                  const isBusy = busy.has(u.id)
                  const liveCols = columns.filter((c) => !c.stale)
                  const allOn = liveCols.length > 0 && liveCols.every((c) => u.numeros.includes(c.key))
                  return (
                    <tr key={u.id} className={isBusy ? 'busy' : undefined}>
                      <td>
                        <div className="user-cell">
                          <span className="avatar" aria-hidden>
                            {initials(u.nome || u.email)}
                          </span>
                          <span>
                            <b>{u.nome || '—'}</b>
                            {isMe && <span className="badge sm outline">você</span>}
                            {u.papel === 'usuario' && u.numeros.length === 0 && <span className="badge sm warning">sem acesso</span>}
                            <span className="user-cell-email">
                              {u.papel === 'usuario' && u.empresa && <span className="user-cell-empresa">{u.empresa} · </span>}
                              {u.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          className="inline-select"
                          aria-label={`Perfil de ${u.nome || u.email}`}
                          value={u.papel}
                          disabled={isMe || isBusy}
                          title={isMe ? 'Você não pode mudar o próprio perfil' : undefined}
                          onChange={(e) => changePapel(u, e.target.value as Papel)}
                        >
                          <option value="usuario">{PAPEL_LABEL.usuario}</option>
                          <option value="admin">{PAPEL_LABEL.admin}</option>
                        </select>
                      </td>
                      <td>
                        {u.papel === 'admin' ? (
                          <span className="access-all" title="Administradores veem todos os blocos">
                            <ShieldCheck size={14} aria-hidden /> todos
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`btn ghost sm panel-btn${panelSummary(u) === 'nenhum' ? ' none' : ''}`}
                            disabled={isBusy}
                            onClick={() => setPickingPanel(u)}
                            aria-label={`Escolher o painel de ${u.nome || u.email}`}
                            title={`Escolher os blocos que esta pessoa vê · ${panelDetail(u)}`}
                          >
                            <LayoutDashboard size={13} aria-hidden /> {panelSummary(u)}
                          </button>
                        )}
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className="access-cell">
                          {u.papel === 'admin' ? (
                            <span className="access-all" title="Administradores veem todos os números">
                              <ShieldCheck size={14} aria-hidden /> todos
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={u.numeros.includes(c.key)}
                              disabled={isBusy}
                              aria-label={`Liberar ${c.key === SEM_NUMERO ? 'conversas sem número' : c.title} para ${u.nome || u.email}`}
                              onChange={() => toggleNumber(u, c.key)}
                            />
                          )}
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          {u.papel === 'usuario' && liveCols.length > 1 && (
                            <button type="button" className="btn ghost sm" disabled={isBusy} onClick={() => setAll(u, !allOn)}>
                              {allOn ? 'Desmarcar todos' : 'Marcar todos'}
                            </button>
                          )}
                          <button type="button" className="btn ghost sm" onClick={() => setEditing(u)} aria-label={`Editar ${u.nome || u.email}`} title="Editar nome ou senha">
                            <Pencil size={13} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm danger"
                            onClick={() => remove(u)}
                            disabled={isMe || isBusy}
                            aria-label={`Excluir ${u.nome || u.email}`}
                            title={isMe ? 'Você não pode excluir a própria conta' : 'Excluir conta'}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {users && users.length > 0 && columns.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="muted">
                      Pessoas com acesso
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="access-cell muted">
                        {fmtInt(usersPerColumn(c.key))}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <NewUserCard columns={columns.filter((c) => !c.stale)} onCreated={() => void reload()} />

      {pickingPanel && <PanelModal user={pickingPanel} onClose={() => setPickingPanel(null)} onSave={(selected) => savePanel(pickingPanel, selected)} />}

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void reload()
            if (editing.id === me.id) void refreshMe()
          }}
        />
      )}
    </div>
  )
}

function NewUserCard({ columns, onCreated }: { columns: Column[]; onCreated: () => void }) {
  const { backend } = useSession()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<Papel>('usuario')
  const [numeros, setNumeros] = useState<string[]>([])
  const [empresa, setEmpresa] = useState('')
  const [panel, setPanel] = useState<PanelSelection>(fullPanel)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ nome: string; email: string; senha: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (senha.length < MIN_SENHA) return setError(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    setBusy(true)
    setError(null)
    try {
      const isUser = papel === 'usuario'
      await backend.createUser({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        papel,
        numeros: isUser ? numeros : [],
        empresa: isUser ? empresa.trim() : '',
        ...(isUser ? storePanel(panel) : { visaoGeral: null, insights: null }),
      })
      setCreated({ nome: nome.trim(), email: email.trim().toLowerCase(), senha })
      setCopied(false)
      setNome('')
      setEmail('')
      setSenha('')
      setPapel('usuario')
      setNumeros([])
      setEmpresa('')
      setPanel(fullPanel())
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(`Acesso ao Rastreio WhatsApp · Solid Marketing Digital\nE-mail: ${created.email}\nSenha: ${created.senha}\n${window.location.origin}${window.location.pathname}`)
      setCopied(true)
    } catch {
      /* sem permissão de área de transferência: os dados continuam visíveis para copiar à mão */
    }
  }

  return (
    <section className="card" aria-label="Novo usuário">
      <div className="card-head">
        <div>
          <h3 className="card-title">Novo usuário</h3>
          <p className="card-sub">A conta já nasce ativa. Envie o e-mail e a senha para a pessoa; ela pode trocar a senha depois de entrar.</p>
        </div>
      </div>

      {created && (
        <div className="callout created-note" role="status">
          <div>
            Conta de <b>{created.nome}</b> criada. Dados de acesso (a senha não aparece de novo):
          </div>
          <div className="created-cred">
            <code>{created.email}</code>
            <code>{created.senha}</code>
            <button type="button" className="btn sm" onClick={() => void copy()}>
              <Copy size={13} aria-hidden /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <form className="new-user-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="nu-nome">Nome</label>
          <input id="nu-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="nu-email">E-mail (login)</label>
          <input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </div>
        <PasswordField id="nu-senha" label="Senha inicial" value={senha} onChange={setSenha} autoComplete="new-password" required canGenerate placeholder={`Mínimo de ${MIN_SENHA} caracteres`} />
        <div className="field">
          <span className="field-label" id="nu-papel">
            Perfil
          </span>
          <div className="segmented" role="group" aria-labelledby="nu-papel">
            {(['usuario', 'admin'] as Papel[]).map((p) => (
              <button key={p} type="button" aria-pressed={papel === p} onClick={() => setPapel(p)}>
                {PAPEL_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {papel === 'usuario' && (
          <div className="field">
            <label htmlFor="nu-empresa">Empresa (aparece no topo do painel)</label>
            <input id="nu-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={80} autoComplete="off" placeholder="Ex.: Império 085" />
          </div>
        )}
        <fieldset className="field span-all">
          <legend className="field-label">Números liberados</legend>
          {papel === 'admin' ? (
            <p className="small muted">Administradores veem todos os números e gerenciam usuários e a planilha.</p>
          ) : columns.length === 0 ? (
            <p className="small muted">Publique a planilha na aba Dados para escolher os números.</p>
          ) : (
            <div className="num-checks">
              {columns.map((c) => (
                <label key={c.key} className="num-check">
                  <input
                    type="checkbox"
                    checked={numeros.includes(c.key)}
                    onChange={(e) => setNumeros((list) => (e.target.checked ? [...list, c.key] : list.filter((n) => n !== c.key)))}
                  />
                  <span>
                    <b>{c.title}</b>
                    <span className="small muted">
                      {c.sub}
                      {c.count !== null ? ` · ${fmtInt(c.count)} conversas` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {papel === 'usuario' && (
          <fieldset className="field span-all">
            <legend className="field-label">Painel que a pessoa vê</legend>
            <PanelPicker value={panel} onChange={setPanel} />
          </fieldset>
        )}
        {error && (
          <div className="callout warn span-all" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions span-all">
          {papel === 'usuario' && numeros.length === 0 && columns.length > 0 && <span className="small muted">Sem número marcado, a pessoa entra mas não vê conversas.</span>}
          <button type="submit" className="btn primary" disabled={busy}>
            <UserPlus size={14} aria-hidden /> {busy ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </section>
  )
}

function EditUserModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const { backend } = useSession()
  const [nome, setNome] = useState(user.nome)
  const [empresa, setEmpresa] = useState(user.empresa)
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (senha && senha.length < MIN_SENHA) return setError(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    setBusy(true)
    setError(null)
    try {
      const patch: PerfilPatch = {}
      if (nome.trim() !== user.nome) patch.nome = nome.trim()
      if (empresa.trim() !== user.empresa) patch.empresa = empresa.trim()
      if (Object.keys(patch).length) await backend.updateUser(user.id, patch)
      if (senha) await backend.setPassword(user.id, senha)
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Editar ${user.nome || user.email}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="eu-email">E-mail (login)</label>
          <input id="eu-email" value={user.email} readOnly disabled />
        </div>
        <div className="field">
          <label htmlFor="eu-nome">Nome</label>
          <input id="eu-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} autoFocus />
        </div>
        {user.papel === 'usuario' && (
          <div className="field">
            <label htmlFor="eu-empresa">Empresa (aparece no topo do painel)</label>
            <input id="eu-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={80} placeholder="Ex.: Império 085" />
          </div>
        )}
        <PasswordField id="eu-senha" label="Nova senha (deixe em branco para manter)" value={senha} onChange={setSenha} autoComplete="new-password" canGenerate />
        {senha && <p className="small muted">Copie a senha antes de salvar e envie para a pessoa.</p>}
        {error && (
          <div className="callout warn" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PanelModal({ user, onClose, onSave }: { user: AppUser; onClose: () => void; onSave: (selected: PanelSelection) => void }) {
  const [selected, setSelected] = useState(() => panelOf(user))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(selected)
    onClose()
  }

  return (
    <Modal title={`Painel de ${user.nome || user.email}`} onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <p className="small muted">
          Escolha os indicadores, gráficos e listas que aparecem para esta pessoa nas abas <b>Visão geral</b> e <b>Insights</b>. Os dados continuam limitados aos
          números liberados para ela.
        </p>
        <fieldset className="field">
          <legend className="sr-only">Painel que a pessoa vê</legend>
          <PanelPicker value={selected} onChange={setSelected} />
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Salvar painel
          </button>
        </div>
      </form>
    </Modal>
  )
}
