import Papa from 'papaparse'
import type { Conversation } from './types'
import { convKeyOf, parseRows } from './parse'

/**
 * Permissão para as conversas que a planilha não liga a nenhum número da empresa
 * (leads que nunca receberam resposta quando a base tem mais de um número).
 */
export const SEM_NUMERO = 'sem-numero'

/** Chave de acesso da conversa: o número da empresa que a atendeu, ou SEM_NUMERO. */
export function accessKey(c: Conversation): string {
  return c.line || SEM_NUMERO
}

/**
 * Divide a planilha em um CSV por número da empresa, cada um só com as linhas das conversas atribuídas
 * a ele (mesmo critério de `Conversation.line`). É o que cada usuário baixa ao entrar.
 */
export function splitCsvByAccess(text: string, convs: Conversation[]): Map<string, string> {
  const keyOfConv = new Map(convs.map((c) => [c.key, accessKey(c)]))
  const { data, meta } = parseRows(text)
  const groups = new Map<string, Record<string, string>[]>()
  for (const row of data) {
    const conv = convKeyOf((row['Tipo'] ?? '').trim(), (row['Telefone'] ?? '').trim(), (row['Respondendo para'] ?? '').trim())
    const key = keyOfConv.get(conv)
    if (key === undefined) continue // linha que o parser descarta (data ou tipo inválidos)
    const rows = groups.get(key)
    if (rows) rows.push(row)
    else groups.set(key, [row])
  }
  const parts = new Map<string, string>()
  groups.forEach((rows, key) => parts.set(key, Papa.unparse(rows, { columns: meta.fields, newline: '\n' })))
  return parts
}

/** Junta CSVs com o mesmo cabeçalho (o de cada número liberado) num só. */
export function joinCsv(texts: string[]): string {
  return texts
    .map((t, i) => {
      const body = t.replace(/^﻿/, '').replace(/[\r\n]+$/, '')
      if (i === 0) return body
      const nl = body.indexOf('\n')
      return nl === -1 ? '' : body.slice(nl + 1)
    })
    .filter((t) => t.length > 0)
    .join('\n')
}
