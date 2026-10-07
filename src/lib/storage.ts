import type { ConvMeta } from './types'

const META_KEY = 'rastreio-whatsapp.meta.v1'
const THEME_KEY = 'rastreio-whatsapp.theme'
const LINE_NAMES_KEY = 'rastreio-whatsapp.lineNames.v1'
const LINE_FILTER_STYLE_KEY = 'rastreio-whatsapp.lineFilterStyle'

export type MetaMap = Record<string, ConvMeta>

export function loadMeta(): MetaMap {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as MetaMap) : {}
  } catch {
    return {}
  }
}

export function saveMeta(map: MetaMap): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(map))
  } catch {
    /* armazenamento indisponível: segue só em memória */
  }
}

export type ThemePref = 'system' | 'light' | 'dark'

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* ignore */
  }
}

/** Apelidos dos números da empresa, indexados pelo número (só dígitos). */
export type LineNames = Record<string, string>

export function loadLineNames(): LineNames {
  try {
    const raw = localStorage.getItem(LINE_NAMES_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as LineNames) : {}
  } catch {
    return {}
  }
}

export function saveLineNames(names: LineNames): void {
  try {
    localStorage.setItem(LINE_NAMES_KEY, JSON.stringify(names))
  } catch {
    /* ignore */
  }
}

export type LineFilterStyle = 'cards' | 'compact'

export function loadLineFilterStyle(): LineFilterStyle {
  try {
    return localStorage.getItem(LINE_FILTER_STYLE_KEY) === 'compact' ? 'compact' : 'cards'
  } catch {
    return 'cards'
  }
}

export function saveLineFilterStyle(style: LineFilterStyle): void {
  try {
    localStorage.setItem(LINE_FILTER_STYLE_KEY, style)
  } catch {
    /* ignore */
  }
}
