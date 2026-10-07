import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LogIn } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { DEMO_ACCOUNTS } from '../auth/demoBackend'
import { PAPEL_LABEL } from '../auth/types'
import { BrandLogo } from '../components/BrandLogo'
import { PasswordField } from '../components/PasswordField'
import { ThemeToggle } from '../components/ThemeToggle'

export function LoginView() {
  const { backend, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, senha)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form className="stack" onSubmit={submit} aria-label="Entrar">
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </div>
        <PasswordField id="login-senha" label="Senha" value={senha} onChange={setSenha} autoComplete="current-password" required />
        {error && (
          <div className="callout warn" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn primary block" disabled={busy}>
          <LogIn size={15} aria-hidden /> {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="small muted center">Esqueceu a senha? Peça ao administrador para redefinir.</p>
      </form>

      {/* import.meta.env.DEV primeiro: no build o bloco e as senhas de demonstração somem do bundle. */}
      {import.meta.env.DEV && backend.kind === 'demo' && (
        <div className="callout demo-note">
          <div>
            <b>Modo demonstração</b> — o Supabase ainda não foi configurado (.env), então as contas ficam só neste navegador.
          </div>
          <div className="demo-accounts">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                className="btn sm"
                onClick={() => {
                  setEmail(a.email)
                  setSenha(a.senha)
                }}
              >
                {PAPEL_LABEL[a.papel]}: {a.email} / {a.senha}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  )
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <main className="auth-card card">
        <BrandLogo className="auth-brand" />
        {children}
      </main>
    </div>
  )
}
