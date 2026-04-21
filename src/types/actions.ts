export interface ActionCategory {
  id: string
  name: string
  color: string
}

export interface Owner {
  id: string
  name: string
  color: string
}

export interface Action {
  id: string
  name: string
  date: string
  is_global: boolean
  category_id: string | null
  category?: ActionCategory
  owner_id: string | null
  owner?: Owner
  notes?: string
  time_spent?: number
  url_ids: string[]
  unranked_url_ids: string[]
  created_at: string
}

export interface RoadmapAction {
  id: string
  name: string
  planned_date: string | null
  category_id: string | null
  category?: ActionCategory
  owner_id: string | null
  owner?: Owner
  is_global: boolean
  notes: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'backlog' | 'in_progress' | 'done'
  estimated_time: number | null
  url_ids: string[]
  unranked_url_ids: string[]
  created_at: string
}

export interface PageType {
  id: string
  name: string
  color: string
  description?: string
}

export interface UnrankedUrl {
  id: string
  url: string
  visible: boolean
}

export interface PeriodImpact {
  gains: number
  losses: number
  stable: number
  avgDelta: number
  avgPosAfter: number
}

export interface ActionImpact {
  action: Action
  categoryColor: string
  kwIds: string[]
  at7d:  PeriodImpact | null
  at1m:  PeriodImpact | null
  at3m:  PeriodImpact | null
}

export interface ThematicGroup {
  category: { id: string; name: string; color: string }
  kwIds: string[]
  avgPosNow: number
  avgPosOld: number
  delta: number
  gains: number
  losses: number
  trend: 'rising' | 'falling' | 'stable'
}

export interface PageTypeGroup {
  pageType: PageType
  urlIds: string[]
  kwIds: string[]
  avgPosNow: number
  avgPosOld: number
  delta: number
  gains: number
  losses: number
}