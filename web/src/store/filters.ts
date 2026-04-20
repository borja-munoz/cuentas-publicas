import { create } from 'zustand'

export type ViewMode = 'plan' | 'ejecucion' | 'comparativa'

export interface PageFilters {
  showViewMode: boolean
  showComparativa: boolean
}

interface FiltersState {
  years: number[]
  selectedYear: number
  compareYears: [number, number] | null
  viewMode: ViewMode
  pageFilters: PageFilters
  setSelectedYear: (y: number) => void
  setCompareYears: (years: [number, number]) => void
  setViewMode: (m: ViewMode) => void
  setPageFilters: (f: Partial<PageFilters>) => void
  initYears: (ys: number[]) => void
}

export const useFilters = create<FiltersState>((set) => ({
  years: [],
  selectedYear: 2024,
  compareYears: null,
  viewMode: 'plan',
  pageFilters: { showViewMode: false, showComparativa: false },
  setSelectedYear: (y) => set({ selectedYear: y }),
  setCompareYears: (years) => set({ compareYears: years }),
  setViewMode: (m) => set({ viewMode: m }),
  setPageFilters: (f) => set((s) => ({ pageFilters: { ...s.pageFilters, ...f } })),
  initYears: (ys) =>
    set({ years: ys, selectedYear: ys.length > 0 ? Math.max(...ys) : 2024 }),
}))
