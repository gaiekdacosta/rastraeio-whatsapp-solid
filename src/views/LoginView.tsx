import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ArrowRight, CalendarCheck, Flame, MessageCircle, ShieldCheck, TrendingUp, Zap } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { DEMO_ACCOUNTS } from '../auth/demoBackend'
import { PAPEL_LABEL } from '../auth/types'
import { SolidMark } from '../components/BrandLogo'
import { PasswordField } from '../components/PasswordField'
import { ThemeToggle } from '../components/ThemeToggle'

export function LoginView() {
  const { backend, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState<false | 'senha' | 'google'>(false)
  const [error, setError] = useState<string | null>(null)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    let alive = true
    void backend.googleEnabled().then((on) => alive && setGoogle(on))
    // Volta do Google com erro (ex.: e-mail sem conta). Num efeito, não no useState: o StrictMode chama duas vezes.
    const redirectError = backend.takeLoginRedirectError()
    if (redirectError) setError(redirectError)
    return () => {
      alive = false
    }
  }, [backend])

  const entrarComGoogle = async () => {
    setBusy('google')
    setError(null)
    try {
      await backend.signInWithGoogle()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('senha')
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
      <div className="auth-intro">
        <h2>Bem-vindo de volta</h2>
        <p>Entre para acompanhar os leads e o atendimento no WhatsApp.</p>
      </div>
      <form className="stack auth-form" onSubmit={submit} aria-label="Entrar">
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            // No toque, o foco automático abriria o teclado por cima da tela de entrada.
            autoFocus={window.matchMedia('(pointer: fine)').matches}
            required
          />
        </div>
        <PasswordField id="login-senha" label="Senha" value={senha} onChange={setSenha} autoComplete="current-password" placeholder="Sua senha" required />
        {error && (
          <div className="callout warn auth-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className={`btn primary block auth-submit${busy === 'senha' ? ' is-busy' : ''}`} disabled={!!busy}>
          {busy === 'senha' ? (
            <>
              <span className="btn-spinner" aria-hidden /> Entrando…
            </>
          ) : (
            <>
              Entrar <ArrowRight size={16} aria-hidden className="auth-submit-arrow" />
            </>
          )}
        </button>
        {google && (
          <>
            <div className="auth-divider" aria-hidden>
              ou
            </div>
            <button type="button" className="btn block auth-google" onClick={() => void entrarComGoogle()} disabled={!!busy}>
              {busy === 'google' ? <span className="btn-spinner" aria-hidden /> : <GoogleLogo />}
              {busy === 'google' ? 'Abrindo o Google…' : 'Entrar com Google'}
            </button>
          </>
        )}
        <p className="small muted center auth-help">
          {google
            ? 'Esqueceu a senha? Entre com o Google usando o e-mail da sua conta, ou peça ao administrador para redefinir.'
            : 'Esqueceu a senha? Peça ao administrador para redefinir.'}
        </p>
      </form>

      {backend.kind === 'demo' && (
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

/** O "G" do Google, nas cores oficiais, como pedem as regras de marca do botão "Entrar com Google". */
function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/* ---------- Fundo vivo e "feed" de exemplo ---------- */

interface FeedItem {
  id: number
  icon: typeof MessageCircle
  tone: 'blue' | 'green' | 'hot' | 'violet'
  title: string
  text: string
  when: string
}

/** Exemplos genéricos do que o painel mostra; nenhum dado real. */
const FEED: FeedItem[] = [
  { id: 1, icon: MessageCircle, tone: 'green', title: 'Novo lead no WhatsApp', text: '“Oi! Quero saber os valores…”', when: 'agora' },
  { id: 2, icon: Zap, tone: 'blue', title: 'Resposta em 2 min', text: 'Atendimento dentro da meta', when: '1 min' },
  { id: 3, icon: Flame, tone: 'hot', title: 'Lead quente', text: 'Pediu orçamento e horário', when: '3 min' },
  { id: 4, icon: CalendarCheck, tone: 'violet', title: 'Agendamento confirmado', text: 'Amanhã, 14h30', when: '6 min' },
  { id: 5, icon: TrendingUp, tone: 'blue', title: 'Resumo do dia', text: '48 conversas · 12 leads novos', when: '9 min' },
]

// Três visíveis + um saindo (fica transparente antes de sumir).
const VISIBLE = 4
const STEP_MS = 3200

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

/** Três cartões que se revezam como um feed ao vivo: o novo entra por cima, o mais antigo sai por baixo. */
function LiveFeed() {
  const reduced = useReducedMotion()
  const [head, setHead] = useState(0)

  useEffect(() => {
    if (reduced) return
    const tick = () => {
      if (document.visibilityState === 'visible') setHead((h) => (h + 1) % FEED.length)
    }
    const id = window.setInterval(tick, STEP_MS)
    return () => window.clearInterval(id)
  }, [reduced])

  const items = Array.from({ length: VISIBLE }, (_, i) => FEED[(head - i + FEED.length * 2) % FEED.length])

  return (
    <ul className="auth-feed" aria-hidden>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <li key={item.id} className={`auth-feed-item tone-${item.tone}${i === 0 ? ' is-new' : ''}`} data-i={i} style={{ '--i': i } as CSSProperties}>
            <span className="auth-feed-icon">
              <Icon size={16} aria-hidden />
            </span>
            <span className="auth-feed-body">
              <span className="auth-feed-title">{item.title}</span>
              <span className="auth-feed-text">{item.text}</span>
            </span>
            <span className="auth-feed-when">{item.when}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const pageRef = useRef<HTMLDivElement>(null)

  // Paralaxe leve das luzes do fundo, só com mouse (no toque não há "mover sem clicar").
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = pageRef.current
    if (!el) return
    const x = e.clientX / window.innerWidth - 0.5
    const y = e.clientY / window.innerHeight - 0.5
    el.style.setProperty('--mx', x.toFixed(3))
    el.style.setProperty('--my', y.toFixed(3))
  }

  return (
    <div className="auth-page" ref={pageRef} onPointerMove={onPointerMove}>
      <div className="auth-bg" aria-hidden>
        <span className="auth-orb orb-1" />
        <span className="auth-orb orb-2" />
        <span className="auth-orb orb-3" />
        <span className="auth-grid" />
      </div>

      <div className="auth-theme">
        <ThemeToggle />
      </div>

      <section className="auth-hero">
        <div className="auth-brand">
          <span className="auth-mark">
            <SolidMark size={26} />
          </span>
          <span className="auth-wordmark">
            <span className="brand-name">Solid</span>
            <span className="brand-tagline">Marketing Digital</span>
          </span>
        </div>
        <p className="auth-headline">
          Seus leads do WhatsApp, <em>em tempo real</em>.
        </p>
        <p className="auth-sub">Acompanhe conversas, tempo de resposta e oportunidades num só painel.</p>
        <LiveFeed />
      </section>

      <main className="auth-card">
        <span className="auth-card-handle" aria-hidden />
        {children}
        <p className="auth-foot">
          <ShieldCheck size={13} aria-hidden /> Acesso restrito a contas criadas pela Solid.
        </p>
      </main>
    </div>
  )
}
