import ReactECharts from 'echarts-for-react'
import { formatEur } from '../../utils/format'
import { CATEGORICAL } from '../../utils/colors'

export interface BarSeries {
  name: string
  data: number[]
  color?: string
}

interface BarChartProps {
  categories: string[]
  series: BarSeries[]
  stacked?: boolean
  horizontal?: boolean
  height?: number
  yFormatter?: (v: number) => string
}

const DEFAULT_COLORS = CATEGORICAL

export default function BarChart({
  categories,
  series,
  stacked = false,
  horizontal = false,
  height = 320,
  yFormatter = (v) => formatEur(v),
}: BarChartProps) {
  const option = {
    color: DEFAULT_COLORS,
    grid: {
      left: horizontal ? 120 : 8,
      right: 8,
      top: series.length > 1 ? 40 : 12,
      bottom: 48,
      containLabel: !horizontal,
    },
    legend:
      series.length > 1
        ? {
            top: 4,
            left: 0,
            itemWidth: 12,
            itemHeight: 12,
            textStyle: { fontSize: 11, color: '#666666', fontFamily: 'Inter, system-ui, sans-serif' },
          }
        : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#fff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { fontSize: 12, color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any[]) => {
        const lines = params.map(
          (p) => `${p.marker} ${p.seriesName}: <b>${yFormatter(p.value)}</b>`,
        )
        return `<div style="font-size:12px">${params[0]?.axisValueLabel ?? params[0]?.name ?? ''}<br/>${lines.join('<br/>')}</div>`
      },
    },
    xAxis: horizontal
      ? {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#e8e8e8' } },
          axisLabel: {
            fontSize: 11,
            color: '#999999',
            fontFamily: 'Inter, system-ui, sans-serif',
            formatter: yFormatter,
          },
        }
      : {
          type: 'category',
          data: categories,
          axisLine: { lineStyle: { color: '#e8e8e8' } },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 11,
            color: '#666666',
            fontFamily: 'Inter, system-ui, sans-serif',
            interval: 'auto',
          },
          splitLine: { show: false },
        },
    yAxis: horizontal
      ? {
          type: 'category',
          data: categories,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            fontSize: 11,
            color: '#1a1a1a',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
          splitLine: { show: false },
        }
      : {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#e8e8e8', type: 'solid' } },
          axisLabel: {
            fontSize: 11,
            color: '#999999',
            fontFamily: 'Inter, system-ui, sans-serif',
            formatter: yFormatter,
          },
        },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'bar',
      stack: stacked ? 'total' : undefined,
      data: s.data,
      itemStyle: {
        color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        borderRadius: stacked ? 0 : [2, 2, 0, 0],
      },
      emphasis: { itemStyle: { opacity: 0.85 } },
      barMaxWidth: horizontal ? 24 : 40,
    })),
  }

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      opts={{ renderer: 'svg' }}
    />
  )
}
