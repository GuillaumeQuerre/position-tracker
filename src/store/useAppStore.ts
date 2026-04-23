import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type HoverTarget = { type: 'keyword' | 'keyword_category' | 'url' | 'url_category' | string; id: string } | null

interface TabPrefs {
  kwSortCol: 'keyword' | 'position' | 'volume' | 'opportunity'
  kwSortDir: 'asc' | 'desc'
  urlSortCol: 'url' | 'position' | 'kwCount'
  urlSortDir: 'asc' | 'desc'
  actionSort: 'date' | 'name' | 'category'
}

const DEFAULT_PREFS: TabPrefs = {
  kwSortCol: 'keyword', kwSortDir: 'asc',
  urlSortCol: 'kwCount', urlSortDir: 'desc',
  actionSort: 'date',
}

interface AppStore {
  hovered: HoverTarget
  setHovered: (target: HoverTarget) => void

  filterMode: 'keyword' | 'category'
  setFilterMode: (mode: 'keyword' | 'category') => void

  dateRange: { from: string; to: string }
  setDateRange: (range: { from: string; to: string }) => void

  projectId: string | null
  setProjectId: (id: string) => void

  tabPrefs: TabPrefs
  setTabPrefs: (prefs: Partial<TabPrefs>) => void
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

      tabPrefs: DEFAULT_PREFS,
      setTabPrefs: (prefs) => set(s => ({ tabPrefs: { ...s.tabPrefs, ...prefs } })),
    }),
    { name: 'position-tracker-store' }
  )
)