import { useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { formatEur } from '../../utils/format'
import { CATEGORICAL } from '../../utils/colors'

export interface TreemapNode {
  name: string
  value: number
  color?: string
  children?: TreemapNode[]
}

interface TreemapChartProps {
  data: TreemapNode[]
  height?: number
}

const PALETTE = [
  ...CATEGORICAL,
  '#dc2626', '#d97706', '#16a34a', '#059669', '#0891b2',
  '#7c3aed', '#c026d3', '#db2777', '#ea580c', '#ca8a04',
  '#4d7c0f', '#0f766e', '#0369a1', '#4338ca', '#7e22ce',
  '#be185d', '#b45309', '#15803d',
]

export default function TreemapChart({ data, height = 420 }: TreemapChartProps) {
  const chartRef = useRef<ReactECharts>(null)

  function handleBack() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = (chartRef.current as any)?.getEchartsInstance?.()
    if (!instance) return
    // Limpiar y re-aplicar la opción fuerza al treemap a volver al nivel raíz
    instance.clear()
    instance.setOption(option)
  }

  // Asignar colores si no vienen en los datos
  const coloredData = data.map((d, i) => ({
    ...d,
    itemStyle: { color: d.color ?? PALETTE[i % PALETTE.length] },
    children: d.children?.map((c, j) => ({
      ...c,
      itemStyle: { color: c.color ?? PALETTE[(i * 5 + j) % PALETTE.length] },
    })),
  }))

  const option = {
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      backgroundColor: '#fff',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { fontSize: 12, color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        return `<div style="font-size:12px">
          <b>${params.name}</b><br/>
          ${formatEur(params.value)}
          ${params.data.percent != null ? `<br/><span style="color:#999">${params.data.percent}% del total</span>` : ''}
        </div>`
      },
    },
    series: [
      {
        type: 'treemap',
        data: coloredData,
        width: '100%',
        height: '100%',
        roam: false,
        leafDepth: 1,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true,
          bottom: 4,
          height: 24,
          itemStyle: {
            color: '#f5f5f5',
            borderColor: '#e8e8e8',
            borderWidth: 1,
            textStyle: { fontSize: 11, color: '#333', fontFamily: 'Inter, system-ui, sans-serif' },
          },
        },
        label: {
          show: true,
          fontSize: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          color: '#fff',
          position: 'insideTopLeft',
          formatter: (params: { name: string; value: number }) =>
            `${params.name}\n${formatEur(params.value)}`,
          overflow: 'truncate',
        },
        upperLabel: {
          show: true,
          fontSize: 11,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          color: '#fff',
          height: 26,
          overflow: 'truncate',
        },
        levels: [
          {
            // Nivel 0: contenedor raíz
            itemStyle: { borderWidth: 0, gapWidth: 4 },
            upperLabel: { show: false },
          },
          {
            // Nivel 1: bloques principales
            itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 3 },
          },
          {
            // Nivel 2: sub-bloques (si los hay)
            itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', gapWidth: 2 },
          },
        ],
        visualMin: 0,
      },
    ],
  }

  return (
    <div style={{ position: 'relative' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height }}
        opts={{ renderer: 'canvas' }}
      />
      <button
        onClick={handleBack}
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          fontSize: 11,
          padding: '2px 8px',
          border: '1px solid #e8e8e8',
          background: '#f5f5f5',
          borderRadius: 3,
          cursor: 'pointer',
          color: '#555',
          lineHeight: '18px',
        }}
        title="Volver al nivel superior"
      >
        ↑ Subir nivel
      </button>
    </div>
  )
}
