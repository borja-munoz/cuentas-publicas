import ReactECharts from 'echarts-for-react'
import { formatEur } from '../../utils/format'
import { CATEGORICAL } from '../../utils/colors'

export interface LineSeries {
  name: string
  data: (number | null)[]
  color?: string
  dashed?: boolean
}

interface LineChartProps {
  categories: string[]
  series: LineSeries[]
  height?: number
  yFormatter?: (v: number) => string
  smooth?: boolean
  markArea?: { xMin: string; xMax: string; label: string }
}

const DEFAULT_COLORS = CATEGORICAL

export default function LineChart({
  categories,
  series,
  height = 300,
  yFormatter = (v) => formatEur(v),
  smooth = false,
  markArea,
}: LineChartProps) {
  const option = {
    color: DEFAULT_COLORS,
    grid: {
      left: 8,
      right: 8,
      top: series.length > 1 ? 40 : 16,
      bottom: 40,
      containLabel: true,
    },
    legend:
      series.length > 1
        ? {
            top: 4,
            left: 0,
            itemWidth: 14,
            itemHeight: 2,
            textStyle: { fontSize: 11, color: '#666666', fontFamily: 'Inter, system-ui, sans-serif' },
          }
        : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { fontSize: 12, color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any[]) => {
        const lines = params
          .filter((p) => p.value != null)
          .map((p) => `${p.marker} ${p.seriesName}: <b>${yFormatter(p.value)}</b>`)
        return `<div style="font-size:12px">${params[0]?.axisValueLabel ?? params[0]?.name ?? ''}<br/>${lines.join('<br/>')}</div>`
      },
    },
    xAxis: {
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
      boundaryGap: false,
    },
    yAxis: {
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
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth,
      lineStyle: {
        width: 2,
        color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        type: s.dashed ? 'dashed' : 'solid',
      },
      itemStyle: {
        color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        borderWidth: 0,
      },
      showSymbol: false,
      emphasis: { disabled: false },
      markArea: markArea
        ? {
            silent: true,
            itemStyle: { color: 'rgba(50,104,145,0.06)' },
            data: [[{ xAxis: markArea.xMin }, { xAxis: markArea.xMax }]],
          }
        : undefined,
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
