import type { Catalog } from '../lib/blocks'

/** Caixas de seleção dos blocos de uma aba, agrupadas. Vai dentro de um `fieldset.field`. */
export function BlockPicker<Id extends string>({
  catalog,
  value,
  onChange,
  disabled,
}: {
  catalog: Catalog<Id>
  value: Set<Id>
  onChange: (next: Set<Id>) => void
  disabled?: boolean
}) {
  const allOn = catalog.all.every((id) => value.has(id))
  const toggle = (id: Id) => {
    const next = new Set(value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <div className="block-picker">
      <div className="block-picker-head">
        <span className="small muted">
          {value.size} de {catalog.all.length} selecionados
        </span>
        <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => onChange(new Set(allOn ? [] : catalog.all))}>
          {allOn ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>
      {catalog.groups.map((group) => (
        <div key={group} className="block-group">
          <span className="block-group-title">{group}</span>
          <div className="num-checks compact">
            {catalog.items
              .filter((b) => b.group === group)
              .map((b) => (
                <label key={b.id} className="num-check">
                  <input type="checkbox" checked={value.has(b.id)} disabled={disabled} onChange={() => toggle(b.id)} />
                  <span>{b.label}</span>
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
