/*
 * Planilha online: o dashboard lê o CSV de uma planilha publicada na internet (Google Sheets, na prática)
 * direto do navegador, em intervalos, em vez de depender de um arquivo enviado pelo administrador.
 *
 * O Google Sheets responde com os cabeçalhos CORS necessários tanto em /export?format=csv (planilha
 * compartilhada com "qualquer pessoa com o link") quanto em /pub?output=csv (Arquivo → Compartilhar →
 * Publicar na web). A pessoa cola o link que tiver; aqui ele vira o endereço do CSV.
 */

export interface SheetSource {
  url: string
  intervaloSeg: number
}

export const SHEET_INTERVALS: { seg: number; label: string }[] = [
  { seg: 60, label: '1 minuto' },
  { seg: 120, label: '2 minutos' },
  { seg: 300, label: '5 minutos' },
  { seg: 600, label: '10 minutos' },
  { seg: 900, label: '15 minutos' },
]

export const DEFAULT_SHEET_INTERVAL = 120

/** Endereços de CSV a tentar, em ordem, a partir do link colado. Vazio = link inválido. */
export function csvCandidates(input: string): string[] {
  const raw = input.trim()
  if (!raw) return []
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return []
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return []
  if (/(^|\.)docs\.google\.com$/.test(u.hostname) && u.pathname.startsWith('/spreadsheets/')) {
    const gid = u.searchParams.get('gid') ?? new URLSearchParams(u.hash.replace(/^#/, '')).get('gid')
    const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([^/]+)/)
    if (pub) {
      const p = new URL(`https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub`)
      if (gid) {
        p.searchParams.set('gid', gid)
        p.searchParams.set('single', 'true')
      }
      p.searchParams.set('output', 'csv')
      return [p.toString()]
    }
    const doc = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/)
    if (doc) {
      const q = gid ? `&gid=${encodeURIComponent(gid)}` : ''
      return [
        `https://docs.google.com/spreadsheets/d/${doc[1]}/export?format=csv${q}`,
        `https://docs.google.com/spreadsheets/d/${doc[1]}/gviz/tq?tqx=out:csv${q}`,
      ]
    }
  }
  return [raw]
}

export const isGoogleSheet = (url: string) => /docs\.google\.com\/spreadsheets\//.test(url)

const SHARE_HINT =
  'No Google Sheets, deixe a planilha como "Qualquer pessoa com o link pode ver" (Compartilhar) ou publique a aba em CSV (Arquivo → Compartilhar → Publicar na web).'

/** Baixa o CSV da planilha. Tenta cada endereço candidato; a primeira resposta válida vence. */
export async function fetchSheetCsv(input: string, signal?: AbortSignal): Promise<{ text: string; url: string }> {
  const candidates = csvCandidates(input)
  if (!candidates.length) throw new Error('Link inválido. Cole o endereço completo da planilha (começando com https://).')
  let lastError: Error | null = null
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal, cache: 'no-store', redirect: 'follow' })
      if (!res.ok) {
        lastError = new Error(
          res.status === 404 ? 'Planilha não encontrada (HTTP 404). Confira o link.' : `A planilha respondeu com erro HTTP ${res.status}. ${SHARE_HINT}`,
        )
        continue
      }
      const text = await res.text()
      if (/^\s*<(!doctype|html|meta)/i.test(text)) {
        lastError = new Error(`O link devolveu uma página da web, não um CSV. ${SHARE_HINT}`)
        continue
      }
      return { text, url }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastError = new Error(`Não foi possível ler a planilha pelo navegador. Confira a internet e o compartilhamento. ${SHARE_HINT}`)
    }
  }
  throw lastError ?? new Error('Não foi possível ler a planilha.')
}
