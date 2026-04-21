import { memo, useCallback } from 'react'

interface Props {
  id: string
  color: string
  label: string
  isActive: boolean
  positionLabel?: string
  volume?: number | null
  stats?: { gain: number; neutral: number; loss: number; noData: number; stale100: number }
  sourceBadge?: 'imported' | 'manual'
  onHover: (id: string) => void
  onLeave: () => void
  onClick: (id: string) => void
}

const BADGE_STYLES = {
  imported: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
  manual:   'bg-indigo-900/40 text-indigo-400 border-indigo-700/50',
}
const BADGE_LABELS = { imported: 'SEM', manual: 'TRK' }

function fmtVol(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return `${v}`
}

export const LegendItem = memo(function LegendItem({
  id, color, label, isActive, positionLabel, volume, stats, sourceBadge,
  onHover, onLeave, onClick,
}: Props) {
  const handleMouseEnter = useCallback(() => onHover(id), [onHover, id])
  const handleClick = useCallback(() => onClick(id), [onClick, id])

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer select-none
        ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800/50'}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {sourceBadge && (
        <span className={`text-[8px] font-bold px-1 py-0 rounded border flex-shrink-0 ${BADGE_STYLES[sourceBadge]}`}>
          {BADGE_LABELS[sourceBadge]}
        </span>
      )}
      <span className={`text-xs truncate min-w-0 ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>
        {label}
      </span>
      <span className="ml-auto flex-shrink-0 flex items-center gap-1">
        {volume != null && volume > 0 && (
          <span className="text-[8px] text-indigo-400/50 font-mono">{fmtVol(volume)}</span>
        )}
        {positionLabel && (
          <span className="text-[10px] text-gray-500 font-mono">({positionLabel})</span>
        )}
        {stats && (
          <span className="text-[10px] font-mono flex items-center">
            <span className="text-gray-600">(</span>
            <span style={{ color: '#22c55e' }}>{stats.gain}</span>
            <span className="text-gray-600">/</span>
            <span style={{ color: '#e5e7eb' }}>{stats.neutral}</span>
            <span className="text-gray-600">/</span>
            <span style={{ color: '#ef4444' }}>{stats.loss}</span>
            {stats.noData > 0 && (<><span className="text-gray-600">/</span><span style={{ color: '#fde68a' }}>{stats.noData}</span></>)}
            {stats.stale100 > 0 && (<><span className="text-gray-600">/</span><span style={{ color: '#374151' }}>{stats.stale100}</span></>)}
            <span className="text-gray-600">)</span>
          </span>
        )}
      </span>
    </div>
  )
})