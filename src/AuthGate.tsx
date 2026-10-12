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
