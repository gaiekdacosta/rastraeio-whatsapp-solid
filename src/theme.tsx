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
}

/* Rampas validadas com scripts/validate_palette.js (--ordinal) para cada superfície. */
const ORDINAL: Record<Resolved, string[]> = {
  light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
  dark: ['#184f95', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
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
  }
}

interface ThemeCtx {
  pref: ThemePref
  resolved: Resolved
  setPref: (p: ThemePref) => void
  palette: Palette
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

  const resolved: Resolved = pref === 'system' ? (osDark ? 'dark' : 'light') : pref
  const [palette, setPalette] = useState<Palette>(() => buildPalette(resolved))

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
    setPalette(buildPalette(resolved))
  }, [resolved])

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p)
    saveTheme(p)
  }, [])

  const value = useMemo(() => ({ pref, resolved, setPref, palette }), [pref, resolved, setPref, palette])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('ThemeProvider ausente')
  return c
}
