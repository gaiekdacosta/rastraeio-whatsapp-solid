import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'
import type { Palette } from '../../theme'
import { fmtInt } from '../../lib/format'
import { ChartTooltip } from '../ChartTooltip'

export interface StackSeries {
  key: string
  label: string
  color: string
}

interface Props {
  data: Record<string, unknown>[]
  nameKey: string
  series: StackSeries[]
  /** Chave com a soma da linha, para o rótulo na ponta da barra. */
  totalKey: string
  palette: Palette
  labelWidth?: number
  rowHeight?: number
}

function truncate(s: string, n = 24): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Barras horizontais empilhadas (ex.: leads por anúncio, divididos por temperatura), com o total na ponta. */
export function StackedHBars({ data, nameKey, series, totalKey, palette, labelWidth = 170, rowHeight = 34 }: Props) {
  const height = Math.max(96, data.length * rowHeight + 12)
  const maxChars = Math.max(12, Math.floor(labelWidth / 6.8))
  const last = series[series.length - 1]?.key
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 56, left: 0, bottom: 2 }} barCategoryGap="28%">
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, max)]} />
        <YAxis
          type="category"
          dataKey={nameKey}
          width={labelWidth}
          tick={{ fill: palette.ink2, fontSize: 12 }}
          tickFormatter={(v: string) => truncate(v, maxChars)}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip content={<ChartTooltip mark="rect" />} cursor={{ fill: palette.surface2 }} isAnimationActive={false} />
        {series.map((s) => (
          // O traço na cor da superfície é o vão de 2px entre os segmentos da pilha.
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="pilha" fill={s.color} stroke={palette.surface} strokeWidth={1} maxBarSize={20} isAnimationActive={false}>
            {s.key === last && (
              <LabelList dataKey={totalKey} position="right" fill={palette.ink2} fontSize={11.5} formatter={(v: ReactNode) => fmtInt(Number(v))} />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
