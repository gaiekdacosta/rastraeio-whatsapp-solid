import type { Backend } from './types'
import { createSupabaseBackend } from './supabaseBackend'
import { createDemoBackend } from './demoBackend'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

/** Os valores de exemplo do .env.example (copiados sem trocar) contam como "sem Supabase". */
const exemplo = (v: string) => /SEU-PROJETO|xxxxxx/i.test(v)

/**
 * Supabase quando as variáveis apontam para um projeto de verdade. Sem elas: modo demonstração, também no
 * build publicado, com contas e planilha guardadas só no navegador de quem acessa.
 */
export const backend: Backend = url && key && !exemplo(url) && !exemplo(key) ? createSupabaseBackend(url, key) : createDemoBackend()
