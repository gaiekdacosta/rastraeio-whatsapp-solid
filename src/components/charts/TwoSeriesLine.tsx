import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Palette } from '../../theme'
import { fmtCompact } from '../../lib/format'
import { ChartTooltip } from '../ChartTooltip'

export interface Series {
  key: string
  label: string
  color: string
}

interface Props {
  data: object[]
  xKey: string
  series: Series[]
  palette: Palette
  height?: number
  titleFormatter?: (label: unknown, row?: Record<string, unknown>) => string
}

export function TwoSeriesLine({ data, xKey, series, palette, height = 260, titleFormatter }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={palette.grid} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={{ stroke: palette.baseline }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v: number) => fmtCompact(v)}
          allowDecimals={false}
        />
        <Tooltip
          content={<ChartTooltip titleFormatter={titleFormatter} />}
          cursor={{ stroke: palette.baseline, strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface, fill: s.color }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
