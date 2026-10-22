import type { Temperature } from './types'

/*
 * Temperatura do lead (frio, morno, quente): vem da coluna Temperatura da planilha. Aceita variações de
 * escrita (maiúsculas, acentos, emoji, inglês); qualquer outro valor conta como "sem temperatura".
 */

/** Do mais quente ao mais frio: a ordem dos gráficos e do filtro. */
export const TEMPERATURE_ORDER: Temperature[] = ['quente', 'morno', 'frio']

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
}

/** Valor do filtro para leads sem temperatura. */
export const TEMPERATURE_NONE = 'none'
export const TEMPERATURE_NONE_LABEL = 'Sem temperatura'

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function parseTemperature(raw: string): Temperature | null {
  const n = strip(raw)
  if (!n) return null
  if (/quent|\bhot\b|🔥/.test(n)) return 'quente'
  if (/morn|\bwarm\b/.test(n)) return 'morno'
  if (/\bfri[oa]s?\b|^fri|\bcold\b|❄/.test(n)) return 'frio'
  return null
}

export function temperatureLabel(t: Temperature | null): string {
  return t ? TEMPERATURE_LABEL[t] : TEMPERATURE_NONE_LABEL
}
