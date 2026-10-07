import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'
import type { Palette } from '../../theme'
import { fmtCompact, fmtInt } from '../../lib/format'
import { ChartTooltip } from '../ChartTooltip'

interface Props {
  data: object[]
  xKey: string
  yKey: string
  label: string
  palette: Palette
  height?: number
  directLabels?: boolean
  color?: string
  titleFormatter?: (label: unknown, row?: Record<string, unknown>) => string
}

export function ColumnBars({ data, xKey, yKey, label, palette, height = 240, directLabels = false, color, titleFormatter }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: directLabels ? 20 : 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        {!directLabels && <CartesianGrid stroke={palette.grid} vertical={false} />}
        <XAxis
          dataKey={xKey}
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={{ stroke: palette.baseline }}
          tickLine={false}
          interval={data.length > 14 ? 'preserveStartEnd' : 0}
          minTickGap={16}
        />
        {directLabels ? (
          <YAxis hide />
        ) : (
          <YAxis
            tick={{ fill: palette.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v: number) => fmtCompact(v)}
            allowDecimals={false}
          />
        )}
        <Tooltip
          content={<ChartTooltip mark="rect" titleFormatter={titleFormatter} />}
          cursor={{ fill: palette.surface2 }}
          isAnimationActive={false}
        />
        <Bar dataKey={yKey} name={label} fill={color ?? palette.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {directLabels && (
            <LabelList
              dataKey={yKey}
              position="top"
              fill={palette.ink2}
              fontSize={11}
              formatter={(v: ReactNode) => (Number(v) ? fmtInt(Number(v)) : '')}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
