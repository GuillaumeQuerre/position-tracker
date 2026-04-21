import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type HoverTarget = { type: 'keyword' | 'keyword_category' | 'url' | 'url_category' | string; id: string } | null

interface AppStore {
  hovered: HoverTarget
  setHovered: (target: HoverTarget) => void

  filterMode: 'keyword' | 'category'
  setFilterMode: (mode: 'keyword' | 'category') => void

  dateRange: { from: string; to: string }
  setDateRange: (range: { from: string; to: string }) => void

  projectId: string | null
  setProjectId: (id: string) => void
}

const today = new Date().toISOString().split('T')[0]
const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0]

export const useAppStore = create<AppStore>()(
  persist(
      (set) => ({
  hovered: null,
  setHovered: (target) => set({ hovered: target }),

  filterMode: 'keyword',
  setFilterMode: (mode) => set({ filterMode: mode }),

  dateRange: { from: thirtyDaysAgo, to: today },
  setDateRange: (range) => set({ dateRange: range }),

  projectId: null,                                   
  setProjectId: (id) => set({ projectId: id }),
}),
  { name: 'position-tracker-store' }
  )
)