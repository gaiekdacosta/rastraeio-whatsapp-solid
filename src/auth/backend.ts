import type { Backend } from './types'
import { createSupabaseBackend } from './supabaseBackend'
import { createDemoBackend } from './demoBackend'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

/**
 * Supabase quando o .env está configurado. Sem ele: modo demonstração no `npm run dev` e, no build,
 * null (o app mostra como configurar em vez de abrir sem login).
 */
export const backend: Backend | null = url && key ? createSupabaseBackend(url, key) : import.meta.env.DEV ? createDemoBackend() : null
