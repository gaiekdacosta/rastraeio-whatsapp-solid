import { Building2, CircleHelp, Users } from 'lucide-react'
import { SEM_NUMERO } from '../lib/access'
import type { Client } from '../lib/clients'
import { useLineNames } from '../lineNames'
import { ChoiceFilter } from './ChoiceFilter'
import type { ChoiceOption } from './ChoiceFilter'

interface Props {
  clients: Client[]
  /** Conversas de leads por cliente (id), com os demais filtros aplicados. */
  counts: Map<string, number>
  /** Conversas de leads de todos os clientes juntos (base da participação). */
  total: number
  value: string // 'all' | id do cliente
  onChange: (id: string) => void
}

/** Filtro do administrador: um cartão por cliente (empresa das contas da aba Usuários). Trocar de cliente muda o painel inteiro. */
export function ClientFilter({ clients, counts, total, value, onChange }: Props) {
  const { label } = useLineNames()
  const real = clients.filter((c) => !c.pseudo)
  const numerosText = (c: Client) => c.numeros.map((n) => (n === SEM_NUMERO ? 'sem número identificado' : label(n))).join(', ')
  const options: ChoiceOption[] = [
    {
      value: 'all',
      title: 'Todos os clientes',
      sub: `${real.length} ${real.length === 1 ? 'cliente' : 'clientes'}`,
      hint: 'Mostrar as conversas de todos os clientes',
      count: total,
      icon: Users,
    },
    ...clients.map((c) => ({
      value: c.id,
      title: c.nome,
      sub: c.pseudo ? 'Números que nenhuma conta tem liberados' : c.numeros.length ? numerosText(c) : 'Nenhum número liberado',
      hint: c.pseudo ? numerosText(c) : [numerosText(c), c.usuarios.length ? `Contas: ${c.usuarios.join(', ')}` : ''].filter(Boolean).join(' · '),
      count: counts.get(c.id) ?? 0,
      icon: c.pseudo ? CircleHelp : Building2,
    })),
  ]
  return <ChoiceFilter label="Clientes" icon={Building2} options={options} value={value} onChange={onChange} />
}
