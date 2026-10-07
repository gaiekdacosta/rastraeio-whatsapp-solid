import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppUser, Backend } from './types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AppUser }
  | { status: 'error'; message: string }

interface AuthCtx {
  backend: Backend
  state: AuthState
  signIn: (email: string, senha: string) => Promise<void>
  signOut: () => Promise<void>
  /** Relê perfil e números liberados (depois de o admin mudar a própria conta, por exemplo). */
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

const sameUser = (a: AppUser, b: AppUser) =>
  a.id === b.id && a.email === b.email && a.nome === b.nome && a.papel === b.papel && [...a.numeros].sort().join() === [...b.numeros].sort().join()

export function AuthProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const user = await backend.currentUser()
      setState((prev) => {
        if (!user) return prev.status === 'signedOut' ? prev : { status: 'signedOut' }
        // Mesmo usuário com os mesmos dados: mantém o objeto para não recarregar a planilha à toa.
        return prev.status === 'signedIn' && sameUser(prev.user, user) ? prev : { status: 'signedIn', user }
      })
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message })
    }
  }, [backend])

  useEffect(() => {
    void refresh()
    return backend.onAuthChange(() => void refresh())
  }, [backend, refresh])

  const signIn = useCallback(
    async (email: string, senha: string) => {
      await backend.signIn(email, senha)
      await refresh()
    },
    [backend, refresh],
  )

  const signOut = useCallback(async () => {
    await backend.signOut()
    setState({ status: 'signedOut' })
  }, [backend])

  const value = useMemo(() => ({ backend, state, signIn, signOut, refresh }), [backend, state, signIn, signOut, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AuthProvider ausente')
  return c
}

/** Para telas que só existem com alguém logado. */
export function useSession(): AuthCtx & { user: AppUser } {
  const c = useAuth()
  if (c.state.status !== 'signedIn') throw new Error('Nenhum usuário logado')
  return { ...c, user: c.state.user }
}
