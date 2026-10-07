import Papa from 'papaparse'
import type { Conversation, Message } from './types'
import type { MetaMap } from './storage'
import { STATUS_LABEL, STAGE_LABEL } from './status'
import { fmtDateTime, fmtPhone } from './format'
import { EXPECTED_COLUMNS } from './parse'

export function buildMessagesCsv(messages: Message[], convs: Conversation[], meta: MetaMap): string {
  const byKey = new Map(convs.map((c) => [c.key, c]))
  const rows = messages.map((m) => {
    const conv = byKey.get(m.convKey)
    const status = conv ? meta[conv.key]?.status : undefined
    return {
      Data: m.rawDate,
      Hora: m.time,
      Lead: m.lead,
      Telefone: m.phone,
      Tipo: m.direction,
      'É resposta': m.direction === 'Enviada' ? 'Sim' : 'Não',
      'Respondendo para': m.replyTo,
      Mensagem: m.text,
      status_manual: status ? STATUS_LABEL[status] : m.statusManual,
    }
  })
  return Papa.unparse(rows, { columns: EXPECTED_COLUMNS, newline: '\n' })
}

export function buildLeadsCsv(convs: Conversation[], meta: MetaMap, lineLabel: (line: string) => string = (l) => l): string {
  const rows = convs.map((c) => {
    const m = meta[c.key] ?? {}
    return {
      Lead: c.name,
      Telefone: c.phone,
      'Telefone formatado': fmtPhone(c.phone),
      Grupo: c.isGroup ? 'Sim' : 'Não',
      'Número da empresa': c.line,
      'Nome do número': c.line ? lineLabel(c.line) : '',
      'Outros números da empresa': c.lines.filter((l) => l !== c.line).join(' '),
      'Primeiro contato': fmtDateTime(c.firstAt),
      'Última mensagem': fmtDateTime(c.lastAt),
      'Mensagens recebidas': c.received,
      'Mensagens enviadas': c.sent,
      Procedimento: c.procedure,
      Canal: c.channel,
      'Estágio inferido': STAGE_LABEL[c.stage],
      'Primeira resposta (min)': c.firstResponseMin == null ? '' : Math.round(c.firstResponseMin),
      'Mediana resposta (min)': c.medianResponseMin == null ? '' : Math.round(c.medianResponseMin),
      'Perguntou valor': c.askedPrice ? 'Sim' : 'Não',
      'Pediu agendamento': c.askedSchedule ? 'Sim' : 'Não',
      'Aguardando resposta da clínica': c.awaitingReply ? 'Sim' : 'Não',
      'Status manual': m.status ? STATUS_LABEL[m.status] : '',
      'Follow-up em': m.followUp ?? '',
      Notas: m.notes ?? '',
    }
  })
  return Papa.unparse(rows, { newline: '\n' })
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['﻿' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
