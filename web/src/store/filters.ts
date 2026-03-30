import { create } from 'zustand'

export type ViewMode = 'plan' | 'ejecucion' | 'comparativa'
export type EntityType = 'Estado' | 'SS'

interface FiltersState {
  years: number[]
  selectedYear: number
  compareYears: [number, number] | null
  viewMode: ViewMode
  entityType: EntityType
  setSelectedYear: (y: number) => void
  setCompareYears: (years: [number, number]) => void
  setViewMode: (m: ViewMode) => void
  setEntityType: (e: EntityType) => void
  initYears: (ys: number[]) => void
}

export const useFilters = create<FiltersState>((set) => ({
  years: [],
  selectedYear: 2024,
  compareYears: null,
  viewMode: 'plan',
  entityType: 'Estado',
  setSelectedYear: (y) => set({ selectedYear: y }),
  setCompareYears: (years) => set({ compareYears: years }),
  setViewMode: (m) => set({ viewMode: m }),
  setEntityType: (e) => set({ entityType: e }),
  initYears: (ys) =>
    set({ years: ys, selectedYear: ys.length > 0 ? Math.max(...ys) : 2024 }),
}))
