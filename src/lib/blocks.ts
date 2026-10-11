/*
 * Blocos de uma aba (indicadores, gráficos, listas) que o administrador escolhe mostrar para cada
 * usuário. O que fica gravado é a lista dos ids VISÍVEIS; null = todos, o que vale também para blocos
 * criados depois. Administradores veem tudo sempre (quem decide isso é cada catálogo, que conhece o papel).
 */

export interface Block<Id extends string = string> {
  readonly id: Id
  readonly label: string
  readonly group: string
}

export interface Catalog<Id extends string> {
  readonly items: readonly Block<Id>[]
  readonly all: readonly Id[]
  readonly groups: readonly string[]
  /** Blocos visíveis a partir da seleção gravada; ids desconhecidos (de versões antigas) são ignorados. */
  visible(selection: readonly string[] | null | undefined): Set<Id>
  /** Seleção para gravar: tudo marcado vira null. */
  store(selected: ReadonlySet<string>): Id[] | null
  /** "todos", "nenhum" ou "5 de 11". */
  summary(selection: readonly string[] | null | undefined): string
}

export function makeCatalog<Id extends string>(items: readonly Block<Id>[]): Catalog<Id> {
  const all = items.map((i) => i.id)
  const known = new Set<string>(all)
  const visible = (selection: readonly string[] | null | undefined): Set<Id> =>
    selection == null ? new Set(all) : new Set(selection.filter((id): id is Id => known.has(id)))
  return {
    items,
    all,
    groups: [...new Set(items.map((i) => i.group))],
    visible,
    store: (selected) => (all.every((id) => selected.has(id)) ? null : all.filter((id) => selected.has(id))),
    summary: (selection) => {
      const n = visible(selection).size
      return n === all.length ? 'todos' : n === 0 ? 'nenhum' : `${n} de ${all.length}`
    },
  }
}
