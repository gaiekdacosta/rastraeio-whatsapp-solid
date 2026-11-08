import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadTheme, saveTheme } from './lib/storage'
import type { ThemePref } from './lib/storage'

export type Resolved = 'light' | 'dark'

export interface Palette {
  mode: Resolved
  series1: string
  series2: string
  series3: string
  ink: string
  ink2: string
  muted: string
  grid: string
  baseline: string
  surface: string
  surface2: string
  ordinal: string[]
  sequential: string[]
  good: string
  warning: string
  serious: string
  critical: string
  /** Classificação na escala frio › morno › quente (rampa ordinal quente validada para cada superfície). */
  temperature: { frio: string; morno: string; quente: string; none: string }
  /** Paleta categórica (8 cores em ordem fixa), para classificações fora da escala de temperatura. */
  categorical: string[]
}

/* Rampas validadas com scripts/validate_palette.js (--ordinal) para cada superfície. */
const ORDINAL: Record<Resolved, string[]> = {
  light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
  dark: ['#184f95', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
}
/* Temperatura (ordinal, um matiz quente): no claro o quente é o mais escuro; no escuro, o mais claro. */
const TEMPERATURE: Record<Resolved, { frio: string; morno: string; quente: string }> = {
  light: { frio: '#f2a06e', morno: '#d9541f', quente: '#8c2a0e' },
  dark: { frio: '#9a3a14', morno: '#e2602a', quente: '#f7b58f' },
}
/* Categórica da skill dataviz, na ordem validada (adjacentes passam CVD nos dois modos). */
const CATEGORICAL: Record<Resolved, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}
/* Sequencial: um matiz, claro→escuro; no escuro a âncora inverte (perto de zero recua para a superfície). */
const SEQUENTIAL: Record<Resolved, string[]> = {
  light: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  dark: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildPalette(mode: Resolved): Palette {
  return {
    mode,
    series1: readVar('--series-1'),
    series2: readVar('--series-2'),
    series3: readVar('--series-3'),
    ink: readVar('--ink'),
    ink2: readVar('--ink-2'),
    muted: readVar('--muted'),
    grid: readVar('--grid'),
    baseline: readVar('--baseline'),
    surface: readVar('--surface-1'),
    surface2: readVar('--surface-2'),
    ordinal: ORDINAL[mode],
    sequential: SEQUENTIAL[mode],
    good: readVar('--status-good'),
    warning: readVar('--status-warning'),
    serious: readVar('--status-serious'),
    critical: readVar('--status-critical'),
    temperature: { ...TEMPERATURE[mode], none: readVar('--baseline') },
    categorical: CATEGORICAL[mode],
  }
}

interface ThemeCtx {
  pref: ThemePref
  resolved: Resolved
  setPref: (p: ThemePref) => void
  palette: Palette
  /** Força um tema temporariamente (o relatório para PDF é sempre claro); null volta à preferência. */
  setOverride: (mode: Resolved | null) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => loadTheme())
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [override, setOverride] = useState<Resolved | null>(null)
  const resolved: Resolved = override ?? (pref === 'system' ? (osDark ? 'dark' : 'light') : pref)
  const [palette, setPalette] = useState<Palette>(() => buildPalette(resolved))

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
    setPalette(buildPalette(resolved))
  }, [resolved])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    saveTheme(p)
  }, [])

  const value = useMemo(() => ({ pref, resolved, setPref, palette, setOverride }), [pref, resolved, setPref, palette])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('ThemeProvider ausente')
  return c
}
