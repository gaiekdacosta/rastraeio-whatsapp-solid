import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useSession } from '../auth/AuthProvider'
import { MIN_SENHA, PAPEL_LABEL } from '../auth/types'
import { Modal } from './Modal'
import { PasswordField } from './PasswordField'

export function UserMenu() {
  const { user, signOut } = useSession()
  const [changing, setChanging] = useState(false)
  return (
    <div className="user-menu">
      <div className="user-chip" title={user.email}>
        <span className="avatar" aria-hidden>
          {initials(user.nome || user.email)}
        </span>
        <span className="user-chip-text">
          <b>{user.nome || user.email}</b>
          <span>{PAPEL_LABEL[user.papel]}</span>
        </span>
      </div>
      <button type="button" className="icon-btn" onClick={() => setChanging(true)} title="Trocar minha senha" aria-label="Trocar minha senha">
        <KeyRound size={16} />
      </button>
      <button type="button" className="icon-btn" onClick={() => void signOut()} title="Sair" aria-label="Sair">
        <LogOut size={16} />
      </button>
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
