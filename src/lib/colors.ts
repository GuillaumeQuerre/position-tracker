const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#14b8a6', '#a855f7', '#eab308',
]

export function getKeywordColor(index: number): string {
  return PALETTE[index % PALETTE.length]
}