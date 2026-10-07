import Papa from 'papaparse'
import type { Direction, Message } from './types'
import { toDateKey } from './format'

export const EXPECTED_COLUMNS = [
  'Data',
  'Hora',
  'Lead',
  'Telefone',
  'Tipo',
  'É resposta',
  'Respondendo para',
  'Mensagem',
  'status_manual',
]

export function parseRows(text: string): Papa.ParseResult<Record<string, string>> {
  return Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
}

function parseDate(data: string, hora: string): Date | null {
  const dm = data.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!dm) return null
  let [, d, m, y] = dm
  if (y.length === 2) y = `20${y}`
  const tm = hora.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  const hh = tm ? Number(tm[1]) : 0
  const mi = tm ? Number(tm[2]) : 0
  const ss = tm && tm[3] ? Number(tm[3]) : 0
  const date = new Date(Number(y), Number(m) - 1, Number(d), hh, mi, ss)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Conversa a que a linha pertence: recebidas pelo telefone do lead, enviadas pelo "Respondendo para".
 * Também usada ao dividir a planilha por número da empresa (lib/access.ts).
 */
export function convKeyOf(direction: string, phone: string, replyTo: string): string {
  return direction === 'Enviada' ? replyTo || phone : phone
}

export interface ParseResult {
  messages: Message[]
  clinicPhones: string[]
  skipped: number
  missingColumns: string[]
}

export function parseCsv(text: string): ParseResult {
  const res = parseRows(text)
  const fields = res.meta.fields ?? []
  const missingColumns = EXPECTED_COLUMNS.filter((c) => c !== 'status_manual' && !fields.includes(c))

  const raw: Omit<Message, 'convKey'>[] = []
  let skipped = 0
  const sentPhones = new Map<string, number>()

  res.data.forEach((row, i) => {
    const at = parseDate(row['Data'] ?? '', row['Hora'] ?? '')
    const tipo = (row['Tipo'] ?? '').trim()
    if (!at || (tipo !== 'Enviada' && tipo !== 'Recebida')) {
      skipped++
      return
    }
    const phone = (row['Telefone'] ?? '').trim()
    const text = (row['Mensagem'] ?? '').trim()
    if (tipo === 'Enviada') sentPhones.set(phone, (sentPhones.get(phone) ?? 0) + 1)
    raw.push({
      id: i,
      at,
      dateKey: toDateKey(at),
      rawDate: (row['Data'] ?? '').trim(),
      time: (row['Hora'] ?? '').trim(),
      lead: (row['Lead'] ?? '').trim(),
      phone,
      direction: tipo as Direction,
      replyTo: (row['Respondendo para'] ?? '').trim(),
      text,
      isMedia: /^\[m[ií]dia\]$/i.test(text),
      statusManual: (row['status_manual'] ?? '').trim(),
    })
  })

  // Toda linha "Enviada" sai de um número da empresa; a base pode ter mais de um.
  const clinicPhones = [...sentPhones.entries()]
    .filter(([p]) => p)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)

  const messages: Message[] = raw.map((m) => ({
    ...m,
    convKey: convKeyOf(m.direction, m.phone, m.replyTo),
  }))
  messages.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id)
  return { messages, clinicPhones, skipped, missingColumns }
}
