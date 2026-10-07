import { useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'

export interface Column<T> {
  key: keyof T & string
  label: string
  numeric?: boolean
  format?: (v: T[keyof T], row: T) => string
}

interface Props<T> {
  title: string
  subtitle?: string
  rows: T[]
  columns: Column<T>[]
  children: ReactNode
  actions?: ReactNode
  emptyText?: string
  legend?: ReactNode
}

export function ChartCard<T extends object>({
  title,
  subtitle,
  rows,
  columns,
  children,
  actions,
  emptyText = 'Sem dados no período selecionado.',
  legend,
}: Props<T>) {
  const [table, setTable] = useState(false)
  const empty = rows.length === 0 || rows.every((r) => columns.filter((c) => c.numeric).every((c) => !Number(r[c.key])))
  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <div>
          <h3 className="card-title">{title}</h3>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        <div className="card-actions">
          {actions}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
            title={table ? 'Ver gráfico' : 'Ver como tabela'}
          >
            {table ? <BarChart3 size={14} /> : <Table2 size={14} />}
            {table ? 'Gráfico' : 'Tabela'}
          </button>
        </div>
      </div>
      {empty ? (
        <div className="empty">{emptyText}</div>
      ) : table ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.format ? c.format(r[c.key], r) : String(r[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend}
          <div className="chart-wrap">{children}</div>
        </>
      )}
    </section>
  )
}
