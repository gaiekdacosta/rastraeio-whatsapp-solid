import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import { useSession } from '../auth/AuthProvider'
import { MIN_SENHA, PAPEL_LABEL } from '../auth/types'
import { Modal } from './Modal'
import { PasswordField } from './PasswordField'

/** Avatar com o nome no topo; clicar abre o menu com trocar senha e sair (um só botão, cabe no celular). */
export function UserMenu() {
  const { user, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="user-menu" ref={root}>
      <button
        type="button"
        className="user-chip"
        title={user.email}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta: ${user.nome || user.email}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar" aria-hidden>
          {initials(user.nome || user.email)}
        </span>
        <span className="user-chip-text">
          <b>{user.nome || user.email}</b>
          <span>{PAPEL_LABEL[user.papel]}</span>
        </span>
        <ChevronDown size={14} className="user-chip-caret" aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Minha conta">
          <div className="menu-head">
            <b>{user.nome || user.email}</b>
            <span>{user.email}</span>
            <span>{PAPEL_LABEL[user.papel]}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setChanging(true)
            }}
          >
            <KeyRound size={15} aria-hidden /> Trocar minha senha
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>
            <LogOut size={15} aria-hidden /> Sair
          </button>
        </div>
      )}
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  )
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { backend } = useSession()
  const [senha, setSenha] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (senha.length < MIN_SENHA) return setError(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
    if (senha !== confirm) return setError('As duas senhas não são iguais.')
    setBusy(true)
    setError(null)
    try {
      await backend.changeOwnPassword(senha)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Trocar minha senha" onClose={onClose}>
      {done ? (
        <div className="stack">
          <div className="callout">Senha alterada. Use a nova senha no próximo login.</div>
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={onClose} autoFocus>
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <PasswordField id="nova-senha" label="Nova senha" value={senha} onChange={setSenha} autoComplete="new-password" autoFocus required placeholder={`Mínimo de ${MIN_SENHA} caracteres`} />
          <PasswordField id="confirma-senha" label="Repita a nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
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
              {busy ? 'Salvando…' : 'Salvar senha'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
