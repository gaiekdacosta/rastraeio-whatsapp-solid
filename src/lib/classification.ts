import type { Palette } from '../theme'

/*
 * Classificação do lead: vem da coluna Classificação da planilha (a mesma que as automações preenchem;
 * planilhas antigas com a coluna Temperatura continuam valendo). Frio, morno e quente, em qualquer grafia
 * (maiúsculas, acentos, emoji, inglês), viram a escala Quente › Morno › Frio, com cores e ícones próprios.
 * Qualquer outro valor (ex.: "Qualificado", "Lead B") vale como veio, com a primeira letra maiúscula.
 */

/** Escala de temperatura, do mais quente ao mais frio: a ordem dos gráficos e do filtro. */
export const SCALE = ['Quente', 'Morno', 'Frio'] as const
export type ScaleClass = (typeof SCALE)[number]

/** Valor do filtro para leads sem classificação. */
export const CLASS_NONE = '__sem_classificacao__'
export const CLASS_NONE_LABEL = 'Sem classificação'

/** Chave da contagem de cada classificação nas linhas do ranking de anúncios. */
export const classKey = (label: string) => `classe:${label}`

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function parseClassification(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || /^[-–—.?/\\]+$/.test(text)) return null
  const n = strip(text)
  // \b no começo evita falsos positivos como "frequente".
  if (/\bquent|\bhot\b|🔥/.test(n)) return 'Quente'
  if (/\bmorn|\bwarm\b/.test(n)) return 'Morno'
  if (/\bfri[oa]s?\b|\bcold\b|❄/.test(n)) return 'Frio'
  if (n === 'sem classificacao' || n === 'nenhuma' || n === 'n/a') return null
  const shouting = text === text.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(text)
  const base = shouting ? text.toLowerCase() : text
  return base[0].toUpperCase() + base.slice(1)
}

export function isScale(label: string | null): label is ScaleClass {
  return !!label && (SCALE as readonly string[]).includes(label)
}

export function classLabel(c: string | null): string {
  return c ?? CLASS_NONE_LABEL
}

/** "Quentes", "Mornos", "Frios"; os outros valores ficam como estão. */
export function classPlural(label: string): string {
  return isScale(label) ? `${label}s` : label
}

/** "leads quentes"; os outros valores entre aspas: leads “Qualificado”. */
export function leadsOf(label: string): string {
  return isScale(label) ? `leads ${classPlural(label).toLowerCase()}` : `leads “${label}”`
}

/** Classificações na ordem dos gráficos: a escala primeiro, depois as outras da mais à menos frequente. */
export function sortClasses(counts: Map<string, number>): string[] {
  const rank = (c: string) => (isScale(c) ? SCALE.indexOf(c) : SCALE.length)
  return [...counts.keys()].sort((a, b) => rank(a) - rank(b) || (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'pt-BR'))
}

/** Mais classificações que isso não cabem numa pilha legível (paleta categórica de 8 cores, uma para "sem"). */
export const MAX_STACK_CLASSES = 7

/**
 * Cor de cada classificação. Só a escala: rampa quente (ordinal). Com outros valores: paleta categórica,
 * na ordem das classificações da base inteira (a cor segue o valor, não muda com os filtros).
 * null = classificações demais para empilhar.
 */
export function classColors(palette: Palette, classes: string[]): Record<string, string> | null {
  const colors: Record<string, string> = { [CLASS_NONE_LABEL]: palette.temperature.none }
  if (classes.every(isScale)) {
    for (const c of classes) colors[c] = palette.temperature[c === 'Quente' ? 'quente' : c === 'Morno' ? 'morno' : 'frio']
    return colors
  }
  if (classes.length > MAX_STACK_CLASSES) return null
  classes.forEach((c, i) => (colors[c] = palette.categorical[i]))
  return colors
}
