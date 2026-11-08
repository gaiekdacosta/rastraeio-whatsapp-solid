import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_SEGMENTO, vocabFor } from './lib/segment'
import type { Vocab } from './lib/segment'

/*
 * Termos do painel (clínica/loja, procedimento/produto, agendamento/pedido) para o tipo de negócio que está
 * na tela: o do usuário ou, para o administrador, o do cliente escolhido no topo (lib/segment.ts).
 */

const Ctx = createContext<Vocab>(vocabFor(DEFAULT_SEGMENTO))

export function VocabProvider({ value, children }: { value: Vocab; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVocab(): Vocab {
  return useContext(Ctx)
}
