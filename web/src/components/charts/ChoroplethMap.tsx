import { useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import type { ScaleSequential } from 'd3-scale'
import { createPortal } from 'react-dom'

const GEO_URL = `${import.meta.env.BASE_URL}geo/ccaa.json`

const W = 800
const H = 560

interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

interface GeoFeature {
  type: 'Feature'
  properties: { ccaa_cod: string; ccaa_nom: string }
  geometry: GeoJSON.Geometry
}

interface TooltipState { x: number; y: number; nom: string; val: number }

interface ChoroplethMapProps {
  data: Record<string, number>
  colorScale: ScaleSequential<string, never>
  onSelect: (ccaaCod: string) => void
  selectedCcaa: string | null
  formatValue?: (v: number) => string
  height?: number
}

export default function ChoroplethMap({
  data,
  colorScale,
  onSelect,
  selectedCcaa,
  formatValue,
  height = 400,
}: ChoroplethMapProps) {
  const [geoData, setGeoData] = useState<GeoFeatureCollection | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((gj: GeoFeatureCollection) => {
        // Desplaza Canarias ~7° al norte y ~4° al este para que aparezca
        // en el recuadro inferior izquierdo del mapa, como es convención en los
        // mapas oficiales españoles (IGN, INE, etc.).
        const shifted = {
          ...gj,
          features: gj.features.map((f) => {
            if (f.properties.ccaa_cod !== 'CN') return f
            const shiftCoord = ([lon, lat]: number[]) => [lon + 4, lat + 7]
            const shiftRing = (ring: number[][]) => ring.map(shiftCoord)
            const geom = f.geometry as GeoJSON.MultiPolygon
            return {
              ...f,
              geometry: {
                type: 'MultiPolygon' as const,
                coordinates: geom.coordinates.map((poly) => poly.map(shiftRing)),
              },
            }
          }),
        }
        setGeoData(shifted)
      })
      .catch(console.error)
  }, [])

  // Build projection once the FeatureCollection is loaded, fitting it to the canvas.
  const pathGenerator = useMemo(() => {
    if (!geoData) return null
    const proj = geoMercator().fitExtent([[20, 20], [W - 20, H - 20]], geoData)
    return geoPath(proj)
  }, [geoData])

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%' }}
        aria-label="Mapa de España por Comunidades Autónomas"
      >
        {(geoData?.features ?? []).map((feat: GeoFeature) => {
          const cod = feat.properties.ccaa_cod
          const nom = feat.properties.ccaa_nom
          const val = data[cod] ?? 0
          const fill = val > 0 ? colorScale(val) : '#e8e8e8'
          const isSelected = cod === selectedCcaa
          const d = pathGenerator?.(feat) ?? ''

          return (
            <path
              key={cod}
              d={d}
              fill={fill}
              stroke={isSelected ? '#1a3a52' : '#ffffff'}
              strokeWidth={isSelected ? 1.5 : 0.6}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(cod)}
              onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, nom, val })}
              onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </svg>

      {tooltip && createPortal(
        <div
          className="fixed z-50 pointer-events-none bg-white border border-[var(--color-rule)] px-3 py-2 text-xs shadow-sm"
          style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}
        >
          <p className="font-semibold text-[var(--color-ink)]">{tooltip.nom}</p>
          {tooltip.val > 0 && formatValue ? (
            <p className="text-[var(--color-ink-muted)] mt-0.5">{formatValue(tooltip.val)}</p>
          ) : (
            <p className="text-[var(--color-ink-faint)] mt-0.5">Sin datos</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

// Leyenda de color (gradiente horizontal)
interface ColorLegendProps {
  colorScale: ScaleSequential<string, never>
  domain: [number, number]
  formatValue?: (v: number) => string
  label?: string
}

export function ColorLegend({ colorScale, domain, formatValue, label }: ColorLegendProps) {
  const steps = 10
  const [min, max] = domain
  const stops = Array.from({ length: steps + 1 }, (_, i) =>
    colorScale(min + (i / steps) * (max - min)),
  )

  return (
    <div className="flex flex-col gap-1 mt-2">
      {label && (
        <p className="text-[0.65rem] text-[var(--color-ink-muted)] uppercase tracking-wider">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] text-[var(--color-ink-muted)] whitespace-nowrap">
          {formatValue ? formatValue(min) : min.toFixed(0)}
        </span>
        <div
          className="h-3 flex-1 rounded-sm"
          style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
        />
        <span className="text-[0.65rem] text-[var(--color-ink-muted)] whitespace-nowrap">
          {formatValue ? formatValue(max) : max.toFixed(0)}
        </span>
      </div>
    </div>
  )
}
