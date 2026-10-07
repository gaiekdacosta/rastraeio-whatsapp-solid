import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadLineNames, saveLineNames } from './lib/storage'
import type { LineNames } from './lib/storage'
import { fmtLine } from './lib/format'

interface LineNamesCtx {
  names: LineNames
  /** Apelido dado pela equipe ou, sem apelido, o número formatado. */
  label: (line: string) => string
  /** true quando o número tem apelido (aí vale mostrar o número ao lado). */
  isRenamed: (line: string) => boolean
  rename: (line: string, name: string) => void
  resetNames: () => void
}

const Ctx = createContext<LineNamesCtx | null>(null)

export function LineNamesProvider({ children }: { children: ReactNode }) {
  const [names, setNames] = useState<LineNames>(() => loadLineNames())

  useEffect(() => {
    saveLineNames(names)
  }, [names])

  const rename = useCallback((line: string, name: string) => {
    setNames((prev) => {
      const next = { ...prev }
      if (name.trim()) next[line] = name
      else delete next[line]
      return next
    })
  }, [])

  const value = useMemo<LineNamesCtx>(
    () => ({
      names,
      label: (line) => (line && names[line]?.trim()) || fmtLine(line),
      isRenamed: (line) => Boolean(line && names[line]?.trim()),
      rename,
      resetNames: () => setNames({}),
    }),
    [names, rename],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLineNames(): LineNamesCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('LineNamesProvider ausente')
  return c
}
