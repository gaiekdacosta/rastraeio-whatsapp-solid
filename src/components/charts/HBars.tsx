import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'
import type { Palette } from '../../theme'
import { fmtInt } from '../../lib/format'
import { ChartTooltip } from '../ChartTooltip'

export interface HBarDatum {
  name: string
  value: number
}

interface Props {
  data: HBarDatum[]
  label: string
  palette: Palette
  colors?: string[]
  format?: (v: number, row?: Record<string, unknown>) => string
  labelWidth?: number
  rowHeight?: number
  color?: string
}

function truncate(s: string, n = 24): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function HBars({ data, label, palette, colors, format, labelWidth = 150, rowHeight = 34, color }: Props) {
  const height = Math.max(96, data.length * rowHeight + 12)
  const maxChars = Math.max(12, Math.floor(labelWidth / 6.8))
  const fmt = (v: number, row?: Record<string, unknown>) => (format ? format(v, row) : fmtInt(v))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 56, left: 0, bottom: 2 }} barCategoryGap="28%">
        <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, max)]} />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tick={{ fill: palette.ink2, fontSize: 12 }}
          tickFormatter={(v: string) => truncate(v, maxChars)}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          content={<ChartTooltip mark="rect" valueFormatter={(v, _k, row) => fmt(v, row)} />}
          cursor={{ fill: palette.surface2 }}
          isAnimationActive={false}
        />
        <Bar dataKey="value" name={label} fill={color ?? palette.series1} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {colors && data.map((_, i) => <Cell key={i} fill={colors[Math.min(i, colors.length - 1)]} />)}
          <LabelList
            dataKey="value"
            position="right"
            fill={palette.ink2}
            fontSize={11.5}
            formatter={(v: ReactNode) => fmt(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
