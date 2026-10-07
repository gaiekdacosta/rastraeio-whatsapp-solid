import { LogOut } from 'lucide-react'
import { useAuth } from './auth/AuthProvider'
import { AuthLayout, LoginView } from './views/LoginView'
import App from './App'

/** Sem login não há dashboard: decide entre carregando, login, erro de acesso e o app. */
export function AuthGate() {
  const { state, signOut, refresh } = useAuth()
  switch (state.status) {
    case 'loading':
      return <div className="loading-screen">Verificando acesso…</div>
    case 'signedOut':
      return <LoginView />
    case 'error':
      return (
        <AuthLayout>
          <div className="stack">
            <div className="callout warn" role="alert">
              {state.message}
            </div>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => void signOut()}>
                <LogOut size={14} aria-hidden /> Sair
              </button>
              <button type="button" className="btn primary" onClick={() => void refresh()}>
                Tentar de novo
              </button>
            </div>
          </div>
        </AuthLayout>
      )
    case 'signedIn':
      // key: trocar de conta zera filtros, conversa aberta e base carregada.
      return <App key={state.user.id} />
  }
}

/** Build de produção sem as variáveis do Supabase: melhor não abrir do que abrir sem login. */
export function MissingConfig() {
  return (
    <AuthLayout>
      <div className="stack">
        <div className="callout warn" role="alert">
          O login ainda não foi configurado neste site.
        </div>
        <p className="small muted">
          Crie o arquivo <code>.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (veja <code>.env.example</code> e o README) e gere o
          build de novo.
        </p>
      </div>
    </AuthLayout>
  )
}
