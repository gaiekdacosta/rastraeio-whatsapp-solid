import type { Stage, Status } from './types'

/*
 * Tipo de negócio do cliente. Muda os termos do painel (clínica → loja, procedimento → produto,
 * agendamento → pedido) e as palavras que as heurísticas procuram nas conversas (lib/analytics.ts).
 * Fica no perfil de cada conta (perfis.segmento); o cliente (empresa) usa o tipo das contas dele.
 */

export type Segmento = 'clinica' | 'loja' | 'outro'

export const SEGMENTOS: Segmento[] = ['clinica', 'loja', 'outro']

/** Contas criadas antes do campo existir eram todas de clínicas. */
export const DEFAULT_SEGMENTO: Segmento = 'clinica'

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  clinica: 'Clínica / estética',
  loja: 'Loja / varejo',
  outro: 'Outro negócio',
}

export const SEGMENTO_HINT: Record<Segmento, string> = {
  clinica: 'Procedimentos e agendamentos',
  loja: 'Produtos e pedidos, sem agendamento',
  outro: 'Produtos ou serviços, com termos neutros',
}

export function asSegmento(v: unknown): Segmento {
  return SEGMENTOS.includes(v as Segmento) ? (v as Segmento) : DEFAULT_SEGMENTO
}

/** Termos do painel para um tipo de negócio. */
export interface Vocab {
  segmento: Segmento
  /** Quem atende, sempre um substantivo feminino ("da clínica", "pela loja", "a empresa respondeu"). */
  empresa: string
  Empresa: string
  /** O que o lead procura. */
  item: string
  itens: string
  Item: string
  Itens: string
  /** Estágio em que o lead mostra intenção (pede horário, quer comprar). */
  intencao: string
  intencaoCriterio: string
  /** A mesma intenção como verbo no plural, minúsculo: "pediram agendamento". */
  pediram: string
  /** Fechamento sinalizado na conversa: agendamento, pedido… */
  fechamento: string
  fechamentos: string
  fechamentoCriterio: string
  /** Coluna do ranking de anúncios: "Agendados", "Pedidos". */
  fechados: string
  /** Coluna das taxas: "Agendaram", "Fizeram pedido". */
  fecharam: string
  taxa: string
  status: Record<Status, string>
  stage: Record<Stage, string>
}

interface Base {
  empresa: string
  item: string
  itens: string
  intencao: string
  intencaoCriterio: string
  pediram: string
  fechamento: string
  fechamentos: string
  fechamentoCriterio: string
  fechados: string
  fecharam: string
  taxa: string
  /** Rótulo do status "agendado" (o id continua o mesmo para não perder o que já foi salvo). */
  statusFechado: string
}

const BASES: Record<Segmento, Base> = {
  clinica: {
    empresa: 'clínica',
    item: 'procedimento',
    itens: 'procedimentos',
    intencao: 'Pediu agendamento',
    intencaoCriterio: 'Mencionou agendar, avaliação ou horário',
    pediram: 'pediram agendamento',
    fechamento: 'agendamento',
    fechamentos: 'agendamentos',
    fechamentoCriterio: 'Clínica confirmou horário, ou houve menção a Pix / sinal',
    fechados: 'Agendados',
    fecharam: 'Agendaram',
    taxa: 'Taxa de agendamento',
    statusFechado: 'Agendado',
  },
  loja: {
    empresa: 'loja',
    item: 'produto',
    itens: 'produtos',
    intencao: 'Interesse de compra',
    intencaoCriterio: 'Perguntou tamanho, estoque ou entrega, ou disse que quer levar',
    pediram: 'quiseram comprar',
    fechamento: 'pedido',
    fechamentos: 'pedidos',
    fechamentoCriterio: 'Loja confirmou pedido, separação ou entrega, ou houve menção a Pix / pagamento',
    fechados: 'Pedidos',
    fecharam: 'Fizeram pedido',
    taxa: 'Taxa de pedido',
    statusFechado: 'Pedido feito',
  },
  outro: {
    empresa: 'empresa',
    item: 'produto ou serviço',
    itens: 'produtos ou serviços',
    intencao: 'Pediu horário ou compra',
    intencaoCriterio: 'Mencionou agendar, horário, tamanho, estoque, entrega ou que quer comprar',
    pediram: 'pediram horário ou compra',
    fechamento: 'fechamento',
    fechamentos: 'fechamentos',
    fechamentoCriterio: 'Empresa confirmou horário ou pedido, ou houve menção a Pix / pagamento',
    fechados: 'Fechados',
    fecharam: 'Fecharam',
    taxa: 'Taxa de fechamento',
    statusFechado: 'Agendado / pedido',
  },
}

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function build(segmento: Segmento): Vocab {
  const b = BASES[segmento]
  return {
    segmento,
    empresa: b.empresa,
    Empresa: cap(b.empresa),
    item: b.item,
    itens: b.itens,
    Item: cap(b.item),
    Itens: cap(b.itens),
    intencao: b.intencao,
    intencaoCriterio: b.intencaoCriterio,
    pediram: b.pediram,
    fechamento: b.fechamento,
    fechamentos: b.fechamentos,
    fechamentoCriterio: b.fechamentoCriterio,
    fechados: b.fechados,
    fecharam: b.fecharam,
    taxa: b.taxa,
    status: {
      novo: 'Novo',
      em_atendimento: 'Em atendimento',
      aguardando_lead: 'Aguardando lead',
      agendado: b.statusFechado,
      convertido: 'Convertido',
      perdido: 'Perdido',
      nao_lead: 'Não é lead',
    },
    stage: {
      sem_retorno_lead: 'Prospecção sem retorno',
      sem_resposta_clinica: `Sem resposta da ${b.empresa}`,
      contato: 'Contato inicial',
      engajado: 'Em conversa',
      pediu_agendamento: b.intencao,
      agendamento: `${cap(b.fechamento)} sinalizado`,
      pagamento: 'Pagamento sinalizado',
    },
  }
}

const VOCABS: Record<Segmento, Vocab> = { clinica: build('clinica'), loja: build('loja'), outro: build('outro') }

export function vocabFor(segmento: Segmento): Vocab {
  return VOCABS[segmento]
}

/** Rótulo do status "agendado" em todos os tipos de negócio (para reconhecer o que vem da planilha). */
export const STATUS_FECHADO_LABELS = SEGMENTOS.map((s) => BASES[s].statusFechado)

/** Troca {empresa}, {Itens}, {taxa}… pelos termos do tipo de negócio (rótulos dos blocos do painel). */
export function fillVocab(template: string, v: Vocab): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => {
    const value = (v as unknown as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : all
  })
}

/**
 * Tipo de negócio de um conjunto de clientes: o deles quando todos são do mesmo tipo; neutro ("outro")
 * quando há tipos diferentes juntos; clínica quando não há cliente nenhum (o comportamento de antes).
 */
export function commonSegmento(segmentos: Segmento[]): Segmento {
  const set = new Set(segmentos)
  if (set.size === 0) return DEFAULT_SEGMENTO
  return set.size === 1 ? [...set][0] : 'outro'
}
