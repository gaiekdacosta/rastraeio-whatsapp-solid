const nf = new Intl.NumberFormat('pt-BR')
const pf = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

export const fmtInt = (n: number) => nf.format(Math.round(n))
export const fmtPct = (n: number) => (Number.isFinite(n) ? pf.format(n) : '—')

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1).replace('.', ',')}K`
  return nf.format(Math.round(n))
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  if (h < 24) {
    const hh = Math.floor(h)
    const mm = Math.round(min - hh * 60)
    return mm > 0 ? `${hh}h ${mm}min` : `${hh}h`
  }
  const d = Math.floor(h / 24)
  const rh = Math.round(h - d * 24)
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export function fmtHours(h: number): string {
  return fmtMinutes(h * 60)
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDateKey(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

export function fmtShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fmtDateTime(d: Date): string {
  return `${fmtShortDate(d)}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fmtPhone(p: string): string {
  if (!/^\d+$/.test(p)) return p
  if (p.length >= 17) return `Grupo ${p.slice(-6)}`
  if (p.startsWith('55') && (p.length === 12 || p.length === 13)) {
    const ddd = p.slice(2, 4)
    const rest = p.slice(4)
    const split = rest.length === 9 ? 5 : 4
    return `+55 (${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
  }
  return `+${p}`
}

/** Número da empresa em formato curto, sem o +55: "(85) 9174-2068". */
export function fmtLine(p: string): string {
  if (!p) return 'Não identificado'
  return fmtPhone(p).replace(/^\+55 /, '')
}

export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function isoWeekKey(d: Date): { key: string; monday: Date } {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (date.getDay() + 6) % 7 // seg = 0
  const monday = new Date(date)
  monday.setDate(date.getDate() - day)
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  const jan4Day = (jan4.getDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - jan4Day)
  const week = 1 + Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000))
  return { key: `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`, monday }
}
