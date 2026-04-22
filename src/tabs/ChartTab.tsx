import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, AreaChart, Area,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { usePositionsData } from '../hooks/usePositionsData'
import { useAppStore } from '../store/useAppStore'
import { useActions } from '../hooks/useActions'
import { LegendItem } from '../components/LegendItem'
import { SkeletonChart } from '../components/SkeletonLoader'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Action } from '../types/actions'

type ViewMode = 'keyword' | 'keyword_category' | 'url' | 'url_category'
type ChartMode = 'keywords' | 'median'
type SortMode = 'alpha' | 'count' | 'gainloss' | 'volume' | 'pos_start' | 'pos_end'

interface BaseMeta { id: string; label: string; color: string; source?: 'imported' | 'manual' }
interface Meta extends BaseMeta {
  positionLabel?: string; delta?: number; volume?: number | null
  stats?: { gain: number; neutral: number; loss: number; noData: number; stale100: number }
}

const COLORS = ['#317979','#a3f1eb','#5ba8a8','#7dcfcf','#2a6565','#4db8b8','#1f4e4e','#68d8d6','#256060','#8ee8e5']
const TREND_GREEN = '#317979', TREND_RED = '#ef4444', TREND_WHITE = '#f6f6f6', TREND_YELLOW = '#fde68a', TREND_DARK = '#4a5568'
const C_PRIMARY = '#317979', C_LIGHT = '#a3f1eb', C_WHITE = '#f6f6f6'

type TrendEntry = { color: string; first: number|null; last: number|null; delta: number; positionLabel: string; trend: 'gain'|'loss'|'neutral'|'noData'|'stale100' }

function computeTrends(kws: {id:string;keyword:string;color:string}[], s: any[]) {
  const m: Record<string,TrendEntry> = {}
  for (const kw of kws) {
    let f:number|null=null,l:number|null=null
    for (let i=0;i<s.length;i++) if(s[i][kw.id]!=null){f=s[i][kw.id];break}
    for (let i=s.length-1;i>=0;i--) if(s[i][kw.id]!=null){l=s[i][kw.id];break}
    if(f==null||l==null){m[kw.id]={color:TREND_YELLOW,first:f,last:l,delta:0,positionLabel:'–',trend:'noData'}}
    else if(f>=100&&l>=100){m[kw.id]={color:TREND_DARK,first:f,last:l,delta:0,positionLabel:`${f}→${l}`,trend:'stale100'}}
    else{const d=f-l;const t=d>0?'gain':d<0?'loss':'neutral';m[kw.id]={color:t==='gain'?TREND_GREEN:t==='loss'?TREND_RED:TREND_WHITE,first:f,last:l,delta:d,positionLabel:`${f}→${l}`,trend:t}}
  }
  return m
}
function computeGroupStats(ids:string[],td:Record<string,TrendEntry>){const s={gain:0,neutral:0,loss:0,noData:0,stale100:0};for(const id of ids)s[td[id]?.trend??'noData']++;return s}

// ── Stat cards ─────────────────────────────────────────────────────────────
const StatCard = memo(function StatCard({
  label, value, color, sub, statKey, isActive, onHover, onLeave, onClick
}: {
  label: string; value: string|number; color?: string; sub?: string
  statKey?: string; isActive?: boolean
  onHover?: (k: string) => void; onLeave?: () => void; onClick?: (k: string) => void
}) {
  const c = color ?? '#4a7a7a'
  const interactive = !!statKey
  return (
    <div
      onMouseEnter={interactive && onHover ? () => onHover(statKey!) : undefined}
      onMouseLeave={onLeave}
      onClick={interactive && onClick ? () => onClick(statKey!) : undefined}
      className={`flex flex-col justify-between rounded-lg px-2.5 py-2 transition-all ${interactive ? 'cursor-pointer' : ''}`}
      style={{
        background: isActive ? `${c}22` : '#0d1f1f',
        border: `1px solid ${isActive ? c : '#1a3535'}`,
        minHeight: '52px',
      }}>
      <span className="text-xl font-bold font-mono leading-none" style={{ color: c }}>{value}</span>
      <div className="flex items-end justify-between mt-1">
        <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: '#4a7a7a' }}>{label}</span>
        {sub && <span className="text-[8px] font-mono" style={{ color: `${c}99` }}>{sub}</span>}
      </div>
    </div>
  )
})

const StatCardEvo = memo(function StatCardEvo({
  label, current, previous, color, statKey, isActive, onHover, onLeave, onClick
}: {
  label: string; current: number; previous: number; color: string
  statKey?: string; isActive?: boolean
  onHover?: (k: string) => void; onLeave?: () => void; onClick?: (k: string) => void
}) {
  const delta = current - previous
  const deltaColor = delta > 0 ? '#a3f1eb' : delta < 0 ? '#ef4444' : '#4a7a7a'
  const interactive = !!statKey
  return (
    <div
      onMouseEnter={interactive && onHover ? () => onHover(statKey!) : undefined}
      onMouseLeave={onLeave}
      onClick={interactive && onClick ? () => onClick(statKey!) : undefined}
      className={`flex flex-col justify-between rounded-lg px-2.5 py-2 transition-all ${interactive ? 'cursor-pointer' : ''}`}
      style={{
        background: isActive ? `${color}22` : '#0d1f1f',
        border: `1px solid ${isActive ? color : '#1a3535'}`,
        minHeight: '52px',
      }}>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span className="text-xl font-bold font-mono" style={{ color }}>{current}</span>
        {delta !== 0 && (
          <span className="text-[11px] font-bold font-mono" style={{ color: deltaColor }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
        {delta === 0 && <span className="text-[10px] font-mono" style={{ color: '#2a5050' }}>=</span>}
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wide mt-1" style={{ color: '#4a7a7a' }}>{label}</span>
    </div>
  )
})

// Keep legacy Pill/PillEvo as thin wrappers so other usages don't break


// ── End dot — renders only at last data point before gap or end ───────────────
function EndDot({ cx, cy, payload, dataKey, index, series, color }: any) {
  if (cx == null || cy == null || !payload || payload[dataKey] == null) return null
  const nextRow = series[index + 1]
  const isLast = !nextRow || nextRow[dataKey] == null
  if (!isLast) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#071212" strokeWidth={2} />
      <line x1={cx - 3} x2={cx + 3} y1={cy + 7} y2={cy + 7}
        stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
    </g>
  )
}

// ── CustomTick: extracted to avoid recreating on every UnifiedChart render ───
// importDates passed via ref to keep the tick component reference stable
const _importDatesRef = { current: new Set<string>() }
function ChartCustomTick({ x, y, payload }: any) {
  const isImport = _importDatesRef.current.has(payload.value)
  let label = ''
  try { label = format(parseISO(payload.value), 'd MMM', { locale: fr }) } catch { label = payload.value }
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle"
        fill={isImport ? '#9ca3af' : '#4b5563'} fontSize={10}
        fontWeight={isImport ? 600 : 400}>
        {label}
      </text>
      {isImport && <circle cx={0} cy={22} r={2} fill="#317979" opacity={0.6} />}
    </g>
  )
}
const CHART_Y_TICKS = [1, 10, 20, 30, 40, 50]


// ── BgChart: purely static layer — only re-renders when series/keywords change ──
// Never re-renders on hover. Separated from highlight layer for this reason.
const BgChart = memo(function BgChart({
  series, bgKeywords, importDates, hasSelection,
}: {
  series: any[]
  bgKeywords: { id: string; keyword: string }[]
  importDates: Set<string>
  hasSelection?: boolean
}) {
  _importDatesRef.current = importDates
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 30, right: 10, bottom: 10, left: 10 }}>
        <XAxis dataKey="date" tick={<ChartCustomTick />} tickLine={false}
          axisLine={{ stroke: '#1f2937' }} interval="preserveStartEnd" />
        <YAxis reversed domain={[1, 50]} ticks={CHART_Y_TICKS}
          tick={{ fill: '#4a7a7a', fontSize: 10 }}
          tickLine={false} axisLine={false} width={30} />
        <ReferenceLine y={3} stroke="#317979" strokeDasharray="2 4"
          label={{ value: 'Top 3', position: 'insideTopRight', fill: '#317979', fontSize: 9 }} />
        <ReferenceLine y={10} stroke="#317979" strokeDasharray="4 4"
          label={{ value: 'Top 10', position: 'insideTopRight', fill: '#317979', fontSize: 9 }} />
        <ReferenceLine y={30} stroke="#2a6060" strokeDasharray="6 4"
          label={{ value: 'Top 30', position: 'insideTopRight', fill: '#2a6060', fontSize: 9 }} />
        {bgKeywords.map(kw => (
          <Line key={kw.id} type="monotone" dataKey={kw.id}
            name={kw.keyword} stroke="#4b5563" strokeWidth={0.6}
            opacity={hasSelection ? 0 : 0.3}
            connectNulls isAnimationActive={false} dot={false} activeDot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
})

// ── HighlightChart: hover/action overlay — only the highlighted curves ────────
// Transparent axes + no axis chrome — purely the colored lines on top of BgChart.
// Re-renders on hover but only renders 1-N lines, never the 500 bg lines.
// Tooltip is updated via direct DOM ref — zero React re-renders on mousemove.
const HL_MARGIN = { top: 30, right: 10, bottom: 10, left: 10 }
const HighlightChart = memo(function HighlightChart({
  series, highlightedKeywords, actionKeywords, actionSeries,
}: {
  series: any[]
  highlightedKeywords: { id: string; keyword: string; color: string }[]
  actionKeywords: { id: string; keyword: string; color: string }[]
  actionSeries: any[] | null
}) {
  const actionIds = useMemo(() => new Set(actionKeywords.map(k => k.id)), [actionKeywords])
  const tooltipRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const mergedSeries = useMemo(() => {
    if (!actionSeries || actionIds.size === 0) return series
    return series.map((row, i) => {
      const actionRow = actionSeries[i]
      const merged: Record<string, any> = { ...row }
      for (const id of actionIds) merged[`__action__${id}`] = actionRow?.[id] ?? null
      return merged
    })
  }, [series, actionSeries, actionIds])

  // All highlighted keywords (both hover and action) for tooltip lookup
  const allHighlighted = useMemo(() => [
    ...highlightedKeywords,
    ...actionKeywords.map(k => ({ ...k, dataKey: `__action__${k.id}` })),
  ], [highlightedKeywords, actionKeywords])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tooltipRef.current || allHighlighted.length === 0) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const tip = tooltipRef.current; if (!tip) return
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      const relX = e.clientX - rect.left - HL_MARGIN.left
      const plotW = rect.width - HL_MARGIN.left - HL_MARGIN.right
      if (relX < 0 || relX > plotW) { tip.style.display = 'none'; return }
      const idx = Math.round((relX / plotW) * (mergedSeries.length - 1))
      const row = mergedSeries[Math.max(0, Math.min(idx, mergedSeries.length - 1))]
      if (!row) { tip.style.display = 'none'; return }
      // Build tooltip HTML directly — no React render
      let dateLabel = row.date
      try { dateLabel = format(parseISO(row.date), 'd MMM yyyy', { locale: fr }) } catch {}
      const lines = allHighlighted
        .map(k => {
          const val = row[(k as any).dataKey ?? k.id]
          if (val == null) return null
          return `<div style="display:flex;align-items:center;gap:5px">
            <span style="width:7px;height:7px;border-radius:50%;background:${k.color};flex-shrink:0"></span>
            <span style="flex:1;font-size:10px;color:#a3c4c4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${k.keyword}</span>
            <span style="font-size:11px;font-weight:600;color:${k.color};font-family:monospace">${val}</span>
          </div>`
        }).filter(Boolean).join('')
      if (!lines) { tip.style.display = 'none'; return }
      tip.innerHTML = `<div style="font-size:9px;color:#4a7a7a;margin-bottom:4px">${dateLabel}</div>${lines}`
      // Position tooltip — flip if too close to right edge
      const tipW = 170
      const left = e.clientX - rect.left + 12
      tip.style.left = (left + tipW > rect.width ? left - tipW - 24 : left) + 'px'
      tip.style.top = (e.clientY - rect.top - 10) + 'px'
      tip.style.display = 'block'
    })
  }

  function handleMouseLeave() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (tooltipRef.current) tooltipRef.current.style.display = 'none'
  }

  if (highlightedKeywords.length === 0 && actionKeywords.length === 0) return null

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {/* Tooltip DOM node — updated directly, never via React state */}
      <div ref={tooltipRef} style={{
        display: 'none', position: 'absolute', zIndex: 50, pointerEvents: 'none',
        background: '#0d1f1f', border: '1px solid #1a3535', borderRadius: 8,
        padding: '7px 10px', minWidth: 140, maxWidth: 200,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }} />
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mergedSeries} margin={HL_MARGIN}>
          {/* Transparent axes — pixel-perfect alignment with BgChart */}
          <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
          <YAxis reversed domain={[1, 50]} ticks={CHART_Y_TICKS}
            tick={false} tickLine={false} axisLine={false} width={30} />
          {highlightedKeywords.map(kw => (
            <Line key={`hl-${kw.id}`} type="monotone" dataKey={kw.id}
              name={kw.keyword} stroke={kw.color} strokeWidth={1.5} opacity={1}
              connectNulls isAnimationActive={false}
              dot={(props: any) => <EndDot {...props} series={mergedSeries} color={kw.color} />}
              activeDot={false} />
          ))}
          {actionKeywords.map(kw => (
            <Line key={`act-${kw.id}`} type="monotone" dataKey={`__action__${kw.id}`}
              name={kw.keyword} stroke={kw.color} strokeWidth={1.5} opacity={1}
              connectNulls isAnimationActive={false}
              dot={(props: any) => <EndDot {...props} series={mergedSeries} color={kw.color} dataKey={`__action__${kw.id}`} />}
              activeDot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

// ── Median chart: background + highlighted in ONE LineChart ─────────────────
const UnifiedMedianChart = memo(function UnifiedMedianChart({
  medianSeries,
  groups,
  highlightedGroups,
}: {
  medianSeries: any[]
  groups: { id: string; label: string; color: string }[]
  highlightedGroups: { id: string; label: string; color: string }[]
}) {
  if (!medianSeries.length || !groups.length) return null
  const highlightedIds = new Set(highlightedGroups.map(g => g.id))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={medianSeries} margin={{ top: 30, right: 10, bottom: 10, left: 10 }}>
        <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 11 }} tickLine={false} axisLine={false}
          tickFormatter={d => { try { return format(parseISO(d), 'd MMM', { locale: fr }) } catch { return d } }} />
        <YAxis reversed domain={[1, 50]} tick={{ fill: '#4a7a7a', fontSize: 11 }}
          tickLine={false} axisLine={false} tickCount={5} width={30} />
        <ReferenceLine y={3} stroke="#317979" strokeDasharray="2 4"
          label={{ value: 'Top 3', position: 'insideTopRight', fill: '#317979', fontSize: 10 }} />
        <ReferenceLine y={10} stroke="#317979" strokeDasharray="4 4"
          label={{ value: 'Top 10', position: 'insideTopRight', fill: '#317979', fontSize: 10 }} />
        <ReferenceLine y={30} stroke="#2a6060" strokeDasharray="6 4"
          label={{ value: 'Top 30', position: 'insideTopRight', fill: '#2a6060', fontSize: 10 }} />

        {/* Background groups */}
        {groups.map(g => (
          <Line key={`bg-${g.id}`} type="monotone" dataKey={g.id}
            name={g.label} stroke={g.color}
            strokeWidth={highlightedIds.has(g.id) ? 2.5 : 1.5}
            opacity={highlightedIds.has(g.id) ? 1 : (highlightedGroups.length > 0 ? 0.2 : 0.7)}
            connectNulls isAnimationActive={false} dot={false} activeDot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
})

// ── Action flags: non-global inside chart, global above chart ──────────────
const ActionFlagsOverlay = memo(function ActionFlagsOverlay({
  actions, dates, series, kwUrlMap, allKwIds, selectedActionId, onClickAction,
}: {
  actions: { action: Action; color: string }[]
  dates: string[]
  series: any[]
  kwUrlMap: Record<string, string>
  allKwIds: string[]
  selectedActionId: string | null
  onClickAction: (a: Action | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: width, h: height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (!actions.length || !dates.length) return <div ref={containerRef} className="absolute inset-0" />

  const dateIndex = useMemo(() => new Map(dates.map((d, i) => [d, i])), [dates])
  const total = dates.length - 1
  const urlToKwIds = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [kwId, urlId] of Object.entries(kwUrlMap)) {
      if (!m[urlId]) m[urlId] = []
      m[urlId].push(kwId)
    }
    return m
  }, [kwUrlMap])
  const lastRow = series[series.length - 1]
  const marginLeft = 40, marginRight = 10, marginTop = 30, marginBottom = 25
  const plotW = dims ? dims.w - marginLeft - marginRight : 0
  const plotH = dims ? dims.h - marginTop - marginBottom : 0
  const posToY = (pos: number) => marginTop + ((pos - 1) / 99) * plotH
  const dateToX = (idx: number) => total > 0 ? marginLeft + (idx / total) * plotW : marginLeft

  function computeImpact(kwIds: string[], row: any) {
    let totalDelta = 0, deltaCount = 0
    for (const kwId of kwIds) {
      const pa = row?.[kwId]; const pe = lastRow?.[kwId]
      if (pa != null && pe != null) { totalDelta += (pa - pe); deltaCount++ }
    }
    const avg = deltaCount > 0 ? totalDelta / deltaCount : 0
    return avg > 0.5 ? TREND_GREEN : avg < -0.5 ? TREND_RED : TREND_WHITE
  }

  const { enrichedNonGlobal, enrichedGlobal } = useMemo(() => {
    const nonGlobal = actions.filter(a => !a.action.is_global)
    const globalActs = actions.filter(a => a.action.is_global)
    const eNonGlobal = nonGlobal.map(({ action, color }) => {
      const idx = dateIndex.get(action.date); if (idx == null) return null
      const row = series.find(s => s.date === action.date); if (!row) return null
      let kwIds: string[] = []
      for (const urlId of action.url_ids) kwIds.push(...(urlToKwIds[urlId] ?? []))
      const positions: number[] = []
      for (const kwId of kwIds) { const p = row[kwId]; if (p != null && typeof p === 'number') positions.push(p) }
      if (!positions.length) return null
      return { action, categoryColor: color, impactColor: computeImpact(kwIds, row),
        x: dateToX(idx), yTop: posToY(Math.min(...positions)), yBottom: posToY(Math.max(...positions)) }
    }).filter(Boolean) as any[]
    const eGlobal = globalActs.map(({ action, color }) => {
      const idx = dateIndex.get(action.date); if (idx == null) return null
      const row = series.find(s => s.date === action.date)
      return { action, categoryColor: color, impactColor: computeImpact(allKwIds, row), x: dateToX(idx) }
    }).filter(Boolean) as { action: Action; categoryColor: string; impactColor: string; x: number }[]
    return { enrichedNonGlobal: eNonGlobal, enrichedGlobal: eGlobal }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, dates, series, dims, kwUrlMap, allKwIds, dateIndex, urlToKwIds])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {dims && (<>
        {/* Global actions — thin dashed vertical line + small label above */}
        {enrichedGlobal.map(({ action, categoryColor, impactColor, x }) => {
          const isSel = selectedActionId === action.id
          const c = isSel ? impactColor : categoryColor
          return (
            <div key={action.id} className="absolute" style={{ left: x, top: 0, height: '100%', transform: 'translateX(-50%)', zIndex: isSel ? 10 : 3, pointerEvents: 'none' }}>
              {/* vertical line through full plot */}
              <div className="absolute" style={{
                left: '50%', top: marginTop, height: plotH,
                width: 1, transform: 'translateX(-50%)',
                background: `linear-gradient(to bottom, ${c}99 0%, ${c}33 70%, transparent 100%)`,
              }} />
              {/* label pill above plot */}
              <button onClick={(e) => { e.stopPropagation(); onClickAction(isSel ? null : action) }}
                className="absolute flex items-center gap-1 whitespace-nowrap"
                style={{
                  pointerEvents: 'auto',
                  top: marginTop - 20, left: '50%', transform: 'translateX(-50%)',
                  padding: '1px 5px 1px 3px', borderRadius: 3,
                  background: isSel ? `${c}22` : 'transparent',
                  border: `1px solid ${c}${isSel ? '66' : '44'}`,
                  color: c, fontSize: 8, fontWeight: isSel ? 700 : 500, letterSpacing: '0.02em',
                  opacity: isSel ? 1 : 0.75,
                }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
                {action.name.length > 16 ? action.name.slice(0, 15) + '…' : action.name}
              </button>
            </div>
          )
        })}
        {/* Non-global actions — thin vertical bar between best and worst position */}
        {enrichedNonGlobal.map(({ action, categoryColor, impactColor, x, yTop, yBottom }: any) => {
          const isSel = selectedActionId === action.id
          const c = isSel ? impactColor : categoryColor
          // Clamp to plot bounds
          const clampedTop = Math.max(yTop, marginTop)
          const clampedBottom = Math.min(yBottom, marginTop + plotH)
          const barH = Math.max(clampedBottom - clampedTop, 6)
          return (
            <div key={action.id} className="absolute" style={{ left: x, top: clampedTop, height: barH, transform: 'translateX(-50%)', zIndex: isSel ? 10 : 2, pointerEvents: 'none' }}>
              {/* thin line */}
              <div className="absolute" style={{
                left: '50%', top: 0, bottom: 0,
                width: isSel ? 2 : 1,
                transform: 'translateX(-50%)',
                background: isSel
                  ? `linear-gradient(to bottom, ${c}cc, ${c}55)`
                  : `linear-gradient(to bottom, ${c}77, ${c}22)`,
                borderRadius: 1,
              }} />
              {/* top cap dot */}
              <div className="absolute" style={{ left: '50%', top: 0, transform: 'translate(-50%, -50%)', width: isSel ? 4 : 3, height: isSel ? 4 : 3, borderRadius: '50%', background: c, opacity: isSel ? 0.9 : 0.5 }} />
              {/* bottom cap dot */}
              <div className="absolute" style={{ left: '50%', bottom: 0, transform: 'translate(-50%, 50%)', width: isSel ? 4 : 3, height: isSel ? 4 : 3, borderRadius: '50%', background: c, opacity: isSel ? 0.9 : 0.5 }} />
              {/* label — text only, no background */}
              <button onClick={(e) => { e.stopPropagation(); onClickAction(isSel ? null : action) }}
                className="absolute whitespace-nowrap"
                style={{
                  pointerEvents: 'auto',
                  top: '50%', left: isSel ? 8 : 6, transform: 'translateY(-50%)',
                  padding: '1px 4px', borderRadius: 2,
                  background: isSel ? `${c}18` : 'transparent',
                  border: `1px solid ${isSel ? `${c}44` : 'transparent'}`,
                  color: c, fontSize: 8, fontWeight: isSel ? 700 : 500,
                  opacity: isSel ? 1 : 0.65,
                }}>
                {action.name.length > 14 ? action.name.slice(0, 13) + '…' : action.name}
              </button>
            </div>
          )
        })}
      </>)}
    </div>
  )
})

// ── Volume chart: search volume (area) + estimated traffic (area) ──────────
// Score color — 10% steps from red to green
function scoreToColor(s: number | null): string {
  if (s == null) return '#4a7a7a'
  if (s >= 100) return '#22c55e'
  if (s >= 90)  return '#4ade80'
  if (s >= 80)  return '#86efac'
  if (s >= 70)  return '#a3f1eb'
  if (s >= 60)  return '#317979'
  if (s >= 50)  return '#f59e0b'
  if (s >= 40)  return '#fb923c'
  if (s >= 30)  return '#f87171'
  if (s >= 20)  return '#ef4444'
  return '#dc2626'
}

function VolumeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  let dateStr = label
  try { dateStr = format(parseISO(label), 'd MMM yyyy', { locale: fr }) } catch {}

  const traffic    = payload.find((p: any) => p.dataKey === 'traffic')?.value ?? 0
  const potential  = payload.find((p: any) => p.dataKey === 'potential30')?.value ?? 0
  const score      = potential > 0 ? Math.round((traffic / potential) * 100) : null
  const scoreColor = scoreToColor(score)

  return (
    <div style={{ background: '#0d1f1f', border: '1px solid #1a3535', borderRadius: 10, padding: '10px 14px', minWidth: 180, pointerEvents: 'none' }}>
      <p style={{ fontSize: 9, color: '#4a7a7a', marginBottom: 8 }}>{dateStr}</p>

      {/* Score badge */}
      {score != null && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #1a3535' }}>
          <span style={{ fontSize: 10, color: '#4a7a7a' }}>Captation objectif</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor, fontFamily: 'monospace' }}>{score}%</span>
        </div>
      )}

      {/* Lines */}
      {[
        { key: 'traffic',      name: 'Trafic estimé',   color: '#a3f1eb' },
        { key: 'potential30',  name: 'Objectif 30%',    color: '#f59e0b' },
        { key: 'searchVolume', name: 'Vol. potentiel',  color: '#317979' },
      ].map(({ key, name, color }) => {
        const entry = payload.find((p: any) => p.dataKey === key)
        if (!entry) return null
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#a3c4c4', flex: 1 }}>{name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: 'monospace' }}>{entry.value?.toLocaleString('fr-FR')}</span>
          </div>
        )
      })}
    </div>
  )
}

const VolumeChart = memo(function VolumeChart({ data }: { data: { date: string; searchVolume: number; traffic: number; potential30?: number }[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-full text-gray-600">Aucune donnée de volume</div>

  // Compute latest score for header badge
  const last = data[data.length - 1]
  const latestScore = last && last.potential30 && last.potential30 > 0
    ? Math.round((last.traffic / last.potential30) * 100) : null
  const scoreColor = scoreToColor(latestScore)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Score badge — top right */}
      {latestScore != null && (
        <div style={{ position: 'absolute', top: 4, right: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: '#0d1f1f', border: `1px solid ${scoreColor}40`, borderRadius: 8, padding: '4px 10px' }}>
          <span style={{ fontSize: 9, color: '#4a7a7a' }}>Captation</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor, fontFamily: 'monospace' }}>{latestScore}%</span>
          <span style={{ fontSize: 9, color: '#4a7a7a' }}>de l'objectif</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 10, bottom: 10, left: 10 }}>
          <defs>
            {/* Volume potentiel — très discret, arrière-plan */}
            <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#317979" stopOpacity={0.10} />
              <stop offset="100%" stopColor="#317979" stopOpacity={0.01} />
            </linearGradient>
            {/* Objectif 30% — amber, visible */}
            <linearGradient id="gradPotential30" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.01} />
            </linearGradient>
            {/* Trafic estimé — teal vif, dominant */}
            <linearGradient id="gradTraffic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#a3f1eb" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#a3f1eb" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={d => { try { return format(parseISO(d), 'd MMM', { locale: fr }) } catch { return d } }} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} tickLine={false} axisLine={false} width={50}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
          <Tooltip content={<VolumeTooltip />} cursor={{ stroke: '#1a3535', strokeWidth: 1 }} />
          {/* Volume potentiel — fond discret, tracé fin */}
          <Area type="monotone" dataKey="searchVolume" name="Vol. potentiel"
            stroke="#317979" strokeWidth={1} strokeDasharray="3 5" fill="url(#gradVolume)"
            isAnimationActive={false} />
          {/* Objectif 30% — cible amber, pointillés épais */}
          <Area type="monotone" dataKey="potential30" name="Objectif 30%"
            stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" fill="url(#gradPotential30)"
            isAnimationActive={false} />
          {/* Trafic estimé — réalité, courbe dominante */}
          <Area type="monotone" dataKey="traffic" name="Trafic estimé"
            stroke="#a3f1eb" strokeWidth={2.5} fill="url(#gradTraffic)"
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
})

// ── URL Panel — liste scrollable des URLs de la sélection + bouton action ──
function UrlPanel({ urlIds, urlMeta, onCreateAction }: {
  urlIds: string[]
  urlMeta: { id: string; label: string; color: string }[]
  onCreateAction?: () => void
}) {
  const [open, setOpen] = useState(false)
  const urls = urlIds.map(id => urlMeta.find(u => u.id === id)).filter(Boolean) as { id: string; label: string; color: string }[]

  return (
    <div className="pt-1.5 pb-1">
      <div className="flex items-center justify-between px-1 mb-1">
        {/* Accordéon URLs — uniquement si des URLs existent */}
        {urls.length > 0 ? (
          <button
            onClick={() => setOpen(p => !p)}
            className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors"
            style={{ color: C_PRIMARY }}>
            <span style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            {urls.length} URL{urls.length > 1 ? 's' : ''} concernée{urls.length > 1 ? 's' : ''}
          </button>
        ) : (
          <span className="text-[9px] uppercase tracking-wider" style={{ color: '#2a5050' }}>
            Aucune URL associée
          </span>
        )}

        {/* Bouton action — toujours visible dès qu'il y a une sélection */}
        {onCreateAction && (
          <button
            onClick={onCreateAction}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{ background: C_PRIMARY, color: '#071212' }}
            title="Créer une action sur cette sélection">
            ⚡ Créer une action
          </button>
        )}
      </div>
      {open && urls.length > 0 && (
        <div className="tracker-scroll max-h-24 overflow-y-auto flex flex-col gap-px">
          {urls.map(u => (
            <div key={u.id} className="flex items-center gap-1.5 px-1 py-0.5 rounded"
              onMouseEnter={e => (e.currentTarget.style.background = '#0d1f1f')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: u.color }} />
              <span className="text-[10px] truncate" style={{ color: '#a3c4c4' }}>{u.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function ChartTab({ onNavigateToActions }: { onNavigateToActions?: (urlIds: string[]) => void }) {
  // ── DATA (fetched once at mount or on dateRange change) ────────────────
  const { series, rawSeries, volumeSeries, keywords, loading, dates, importDates, volumeMap, hasVolumes } = usePositionsData()  // Supabase: 1 paginated query, on dateRange change
  const { dateRange, setDateRange } = useAppStore()
  // hovered est local — pas dans Zustand pour éviter le re-render global à chaque survol
  const [hovered, setHovered] = useState<{ type: string; id: string } | null>(null)

  // Pending date range — local edit buffer, applied only on confirm
  const [pendingRange, setPendingRange] = useState(dateRange)
  const pendingChanged = pendingRange.from !== dateRange.from || pendingRange.to !== dateRange.to
  const _useActions = useActions() as any
  const allActions: Action[] = _useActions.actions ?? []
  const actionCategories: { id: string; name: string; color: string }[] = _useActions.categories ?? []
  const actionOwners: { id: string; name: string; color: string }[] = _useActions.owners ?? []

  // ── LOCAL STATE ──────────────────────────────────────────────────────────
  const [viewMode, setViewMode]           = useState<ViewMode>('keyword')
  const [chartMode, setChartMode]         = useState<ChartMode>('keywords')
  const [displayMode, setDisplayMode]     = useState<'position' | 'volume'>('position')
  const [sortMode, setSortMode]           = useState<SortMode>('alpha')
  const [gainLossAsc, setGainLossAsc]     = useState(false)  // false=gains first, true=losses first
  const [detailSortMode, setDetailSortMode] = useState<'alpha' | 'gainloss' | 'volume'>('alpha')
  const [detailSortAsc, setDetailSortAsc] = useState(false)
  const [lockedItem, setLockedItem]       = useState<string | null>(null)
  const [multiSelect, setMultiSelect]     = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery]     = useState('')
  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [statHover, setStatHover]         = useState<string | null>(null)
  const [lockedStat, setLockedStat]       = useState<string | null>(null)
  const [actionColorMode, setActionColorMode] = useState<'category' | 'owner'>('category')

  // ── META (fetched once at mount) — Supabase: 5 queries ────────────────
  const [kwCategories, setKwCategories]   = useState<(BaseMeta & { source: 'imported'|'manual' })[]>([])
  const [urlCategories, setUrlCategories] = useState<(BaseMeta & { source: 'imported'|'manual' })[]>([])
  const [urlMeta, setUrlMeta]             = useState<BaseMeta[]>([])
  const [kwTagMap, setKwTagMap]           = useState<Record<string, string[]>>({})
  const [kwUrlMap, setKwUrlMap]           = useState<Record<string, string>>({})
  const [urlCatMap, setUrlCatMap]         = useState<Record<string, string[]>>({})

  useEffect(() => {
    // RUNS on mount and on projectId change — 5 Supabase calls batched in Promise.all
    async function loadMeta() {
      const [{ data: kwCats }, { data: urlCats }, { data: kwTags }, { data: urlTags }, { data: kwUrlRows }] = await Promise.all([
        supabase.from('keyword_categories').select('id, name, color, source'),
        supabase.from('url_categories').select('id, name, color, source'),
        supabase.from('keyword_tags').select('keyword_id, category_id'),
        supabase.from('url_tags').select('url_id, category_id'),
        // DISTINCT keyword→url mapping: select only the most recent url per keyword
        // Use a dedicated RPC or a minimal query — no date column needed, just the mapping
        supabase.from('positions')
          .select('keyword_id, url_id, urls(url)')
          .not('url_id', 'is', null)
          .order('date', { ascending: false })
          // Limit to avoid full table scan — we only need one url per keyword
          // Post-process to take first occurrence per keyword_id
          .limit(5000),
      ])
      setKwCategories((kwCats ?? []).map((c, i) => ({ id: c.id, label: c.name, color: c.color ?? COLORS[i % COLORS.length], source: (c.source as any) ?? 'manual' })))
      setUrlCategories((urlCats ?? []).map((c, i) => ({ id: c.id, label: c.name, color: c.color ?? COLORS[i % COLORS.length], source: (c.source as any) ?? 'manual' })))
      const km: Record<string, string[]> = {}; for (const t of kwTags ?? []) { if (!km[t.keyword_id]) km[t.keyword_id] = []; km[t.keyword_id].push(t.category_id) }; setKwTagMap(km)
      const um = new Map<string, string>()
      const kwU: Record<string, string> = {}
      for (const p of kwUrlRows ?? []) {
        if (p.url_id && !kwU[p.keyword_id]) { // first = most recent (ordered DESC)
          um.set(p.url_id, (p.urls as any)?.url ?? p.url_id)
          kwU[p.keyword_id] = p.url_id
        }
      }
      setKwUrlMap(kwU)
      setUrlMeta([...um.entries()].map(([id, url], i) => ({ id, label: url, color: COLORS[i % COLORS.length] })))
      const ucm: Record<string, string[]> = {}; for (const t of urlTags ?? []) { if (!ucm[t.url_id]) ucm[t.url_id] = []; ucm[t.url_id].push(t.category_id) }; setUrlCatMap(ucm)
    }
    loadMeta()
  }, [])

  // ── DERIVED (all useMemo — NO Supabase calls, NO side effects) ────────

  // Recalculated only when data changes (dateRange change)
  const trendData = useMemo(() => computeTrends(keywords, rawSeries), [rawSeries, keywords])

  // Recalculated only when viewMode or meta changes
  const groupToKwIds = useMemo(() => {
    const m: Record<string, string[]> = {}
    if (viewMode === 'keyword_category') { for (const kw of keywords) for (const c of (kwTagMap[kw.id] ?? [])) { if (!m[c]) m[c] = []; m[c].push(kw.id) } }
    else if (viewMode === 'url') { for (const kw of keywords) { const u = kwUrlMap[kw.id]; if (u) { if (!m[u]) m[u] = []; m[u].push(kw.id) } } }
    else if (viewMode === 'url_category') { for (const kw of keywords) { const u = kwUrlMap[kw.id]; if (u) for (const c of (urlCatMap[u] ?? [])) { if (!m[c]) m[c] = []; m[c].push(kw.id) } } }
    return m
  }, [viewMode, keywords, kwTagMap, kwUrlMap, urlCatMap])

  // Recalculated only when chartMode/viewMode/data changes
  const { medianSeries, medianGroups } = useMemo(() => {
    if (chartMode !== 'median') return { medianSeries: [] as any[], medianGroups: [] as { id: string; label: string; color: string }[] }

    if (viewMode === 'keyword') {
      // Single average line across all keywords
      const ms = series.map(row => {
        const vals = keywords.map(k => row[k.id]).filter((v: any) => v != null && v < 100) as number[]
        return { date: row.date, all: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null }
      })
      return { medianSeries: ms, medianGroups: [{ id: 'all', label: 'Moyenne globale', color: '#c5a55a' }] }
    }

    const base: BaseMeta[] = viewMode === 'keyword_category' ? kwCategories : viewMode === 'url' ? urlMeta : urlCategories
    const ms = series.map(row => {
      const e: Record<string, any> = { date: row.date }
      for (const item of base) {
        const vals = (groupToKwIds[item.id] ?? []).map(id => row[id]).filter((v: any) => v != null && v < 100) as number[]
        e[item.id] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null
      }
      return e
    })
    return { medianSeries: ms, medianGroups: base.map(i => ({ id: i.id, label: i.label, color: i.color })) }
  }, [chartMode, viewMode, series, kwCategories, urlMeta, urlCategories, groupToKwIds])

  // Audit stats for average mode — recalculate based on groups instead of keywords
  const avgModeAuditStats = useMemo(() => {
    if (chartMode !== 'median') return null
    const base: BaseMeta[] = viewMode === 'keyword'
      ? [{ id: 'all', label: 'Tous', color: '#c5a55a' }]
      : viewMode === 'keyword_category' ? kwCategories : viewMode === 'url' ? urlMeta : urlCategories

    const groupTrends: { delta: number; trend: 'gain' | 'loss' | 'neutral' }[] = []
    for (const item of base) {
      const kwIds = viewMode === 'keyword' ? keywords.map(k => k.id) : (groupToKwIds[item.id] ?? [])
      const firstPositions: number[] = [], lastPositions: number[] = []
      for (const kwId of kwIds) {
        const td = trendData[kwId]
        if (td?.first != null && td.first < 100) firstPositions.push(td.first)
        if (td?.last != null && td.last < 100) lastPositions.push(td.last)
      }
      if (!firstPositions.length || !lastPositions.length) continue
      const avgFirst = firstPositions.reduce((a, b) => a + b, 0) / firstPositions.length
      const avgLast = lastPositions.reduce((a, b) => a + b, 0) / lastPositions.length
      const delta = Math.round((avgFirst - avgLast) * 10) / 10
      groupTrends.push({ delta, trend: delta > 0.5 ? 'gain' : delta < -0.5 ? 'loss' : 'neutral' })
    }

    const gains = groupTrends.filter(g => g.trend === 'gain').length
    const losses = groupTrends.filter(g => g.trend === 'loss').length
    const neutrals = groupTrends.filter(g => g.trend === 'neutral').length
    const realGains = groupTrends.filter(g => g.delta > 0)
    const realLosses = groupTrends.filter(g => g.delta < 0)
    const ag = realGains.length ? Math.round(realGains.reduce((s, x) => s + x.delta, 0) / realGains.length * 10) / 10 : 0
    const al = realLosses.length ? Math.round(Math.abs(realLosses.reduce((s, x) => s + x.delta, 0) / realLosses.length) * 10) / 10 : 0

    return { total: groupTrends.length, gains, losses, neutrals, avgGain: ag, avgLoss: al }
  }, [chartMode, viewMode, keywords, kwCategories, urlMeta, urlCategories, groupToKwIds, trendData])

  // Recalculated only when actions/dateRange changes (not on hover)
  const relevantActions = useMemo(() =>
    allActions
      .filter((a: Action) => a.date >= dateRange.from && a.date <= dateRange.to)
      .map((a: Action) => ({
        action: a,
        color: actionColorMode === 'owner'
          ? (actionOwners.find((o: { id: string; color: string }) => o.id === a.owner_id)?.color ?? '#4a7a7a')
          : (actionCategories.find((c: { id: string; color: string }) => c.id === a.category_id)?.color ?? '#6b7280')
      }))
  , [allActions, actionCategories, actionOwners, actionColorMode, dateRange])

  // ── HOVER-DEPENDENT (lightweight, recalculated on hover) ─────────────
  const activeId = lockedItem ?? hovered?.id ?? null

  // Only computes a Set — very fast
  const highlightedIds = useMemo(() => {
    // Multi-select takes priority
    if (multiSelect.size > 0) return multiSelect
    if (!activeId) return null
    if (viewMode === 'keyword') return new Set([activeId])
    return new Set(groupToKwIds[activeId] ?? [])
  }, [activeId, multiSelect, viewMode, groupToKwIds])

  // Stat card hover/lock → highlight matching keywords on chart
  const activeStat = lockedStat ?? statHover
  const statHighlightedIds = useMemo(() => {
    if (!activeStat) return null
    const entries = Object.entries(trendData)
    let filtered: string[]
    if (activeStat === 'gain') filtered = entries.filter(([, v]) => v.trend === 'gain').map(([k]) => k)
    else if (activeStat === 'loss') filtered = entries.filter(([, v]) => v.trend === 'loss').map(([k]) => k)
    else if (activeStat === 'neutral') filtered = entries.filter(([, v]) => v.trend === 'neutral').map(([k]) => k)
    else if (activeStat === 'top3') filtered = entries.filter(([, v]) => v.last != null && v.last <= 3).map(([k]) => k)
    else if (activeStat === 'top4_10') filtered = entries.filter(([, v]) => v.last != null && v.last >= 4 && v.last <= 10).map(([k]) => k)
    else if (activeStat === 'top11_30') filtered = entries.filter(([, v]) => v.last != null && v.last >= 11 && v.last <= 30).map(([k]) => k)
    else return null
    return new Set(filtered)
  }, [activeStat, trendData])

  // Action click → highlight keywords linked to the action's URLs
  const actionHighlightedIds = useMemo(() => {
    if (!selectedAction) return null
    if (selectedAction.is_global) return new Set(keywords.map(k => k.id))
    // Build url→kwIds from kwUrlMap
    const urlToKwIds: Record<string, string[]> = {}
    for (const [kwId, urlId] of Object.entries(kwUrlMap)) {
      if (!urlToKwIds[urlId]) urlToKwIds[urlId] = []
      urlToKwIds[urlId].push(kwId)
    }
    const kwIds: string[] = []
    for (const urlId of selectedAction.url_ids) {
      kwIds.push(...(urlToKwIds[urlId] ?? []))
    }
    if (!kwIds.length) return null
    return new Set(kwIds)
  }, [selectedAction, kwUrlMap, keywords])

  // Merge: legend hover > stat hover (action handled separately)
  const nonActionHighlightedIds = highlightedIds ?? statHighlightedIds

  // Compute action-relative trends (action date → last date) as TrendEntry
  const actionTrendMap = useMemo((): Record<string, TrendEntry> | null => {
    if (!selectedAction || !actionHighlightedIds) return null
    const actionRow = rawSeries.find(s => s.date === selectedAction.date)
    const lastRow = rawSeries[rawSeries.length - 1]
    if (!actionRow || !lastRow) return null

    const map: Record<string, TrendEntry> = {}
    for (const kwId of actionHighlightedIds) {
      const posAtAction = actionRow[kwId] as number | null
      const posAtEnd = lastRow[kwId] as number | null

      if (posAtAction == null || posAtEnd == null) {
        // Pas de donnée à la date exacte de l'action — fallback sur la tendance globale (vert/rouge/blanc)
        const fallback = trendData[kwId]
        const fallbackColor = fallback?.trend === 'gain' ? TREND_GREEN
          : fallback?.trend === 'loss' ? TREND_RED
          : TREND_WHITE
        map[kwId] = {
          color: fallbackColor,
          first: posAtAction ?? fallback?.first ?? null,
          last: posAtEnd ?? fallback?.last ?? null,
          delta: fallback?.delta ?? 0,
          positionLabel: fallback?.positionLabel ?? '–',
          trend: fallback?.trend ?? 'noData'
        }
        continue
      }

      const delta = posAtAction - posAtEnd
      const trend = delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'neutral' as TrendEntry['trend']
      map[kwId] = {
        color: trend === 'gain' ? TREND_GREEN : trend === 'loss' ? TREND_RED : TREND_WHITE,
        first: posAtAction, last: posAtEnd, delta,
        positionLabel: `${posAtAction}→${posAtEnd}`, trend,
      }
    }
    return map
  }, [selectedAction, actionHighlightedIds, rawSeries, trendData])

  // Series with values nulled before action date (same length, same X axis)
  const actionNulledSeries = useMemo(() => {
    if (!selectedAction || !actionHighlightedIds) return null
    const actionIdx = series.findIndex(s => s.date === selectedAction.date)
    if (actionIdx < 0) return null

    return series.map((row, i) => {
      if (i >= actionIdx) return row
      // Null out all keyword values before the action date
      const nulled: Record<string, any> = { date: row.date }
      for (const kwId of actionHighlightedIds) nulled[kwId] = null
      return nulled
    })
  }, [selectedAction, actionHighlightedIds, series])

  // Action-highlighted keywords (with action-relative colors)
  const actionHighlightedKeywords = useMemo(() => {
    if (!actionHighlightedIds || !actionTrendMap) return []
    return keywords
      .filter(k => actionHighlightedIds.has(k.id))
      .map(k => ({
        id: k.id, keyword: k.keyword,
        color: actionTrendMap[k.id]?.color ?? TREND_WHITE
      }))
  }, [actionHighlightedIds, actionTrendMap, keywords])

  // Normal highlighted keywords (legend hover / stat hover — full series, normal colors)
  const highlightedKeywords = useMemo(() => {
    if (!nonActionHighlightedIds) return []
    return keywords
      .filter(k => nonActionHighlightedIds.has(k.id) && trendData[k.id]?.trend !== 'noData')
      .map(k => ({ id: k.id, keyword: k.keyword, color: trendData[k.id]?.color ?? TREND_WHITE }))
  }, [nonActionHighlightedIds, keywords, trendData])

  // effectiveHighlightedIds for detail panel (includes all sources)
  const effectiveHighlightedIds = highlightedIds ?? actionHighlightedIds ?? statHighlightedIds

  // URL IDs linked to the current selection
  const selectedUrlIds = useMemo(() => {
    if (!effectiveHighlightedIds || !effectiveHighlightedIds.size) return new Set<string>()
    const ids = new Set<string>()
    for (const kwId of effectiveHighlightedIds) {
      const uid = kwUrlMap[kwId]
      if (uid) ids.add(uid)
    }
    return ids
  }, [effectiveHighlightedIds, kwUrlMap])

  // Volume series filtered to selection (falls back to full when nothing selected)
  const filteredVolumeSeries = useMemo(() => {
    if (!hasVolumes || !effectiveHighlightedIds || !effectiveHighlightedIds.size) return volumeSeries
    // Recompute volume series for selected keywords only
    const CTR_BY_POS = [0,0.316,0.152,0.098,0.068,0.051,0.038,0.029,0.022,0.018,0.015]
    function getCTR(pos: number) {
      if (pos < 1 || pos > 100) return 0
      if (pos <= 10) return CTR_BY_POS[pos]
      if (pos <= 20) return 0.01
      if (pos <= 30) return 0.005
      if (pos <= 50) return 0.002
      return 0.0005
    }
    return series.map(row => {
      let searchVolume = 0, traffic = 0
      for (const kwId of effectiveHighlightedIds) {
        const vol = volumeMap[kwId]
        if (vol == null) continue
        searchVolume += vol
        const pos = row[kwId]
        if (pos != null) traffic += Math.round(vol * getCTR(pos))
      }
      // potential30 = 30% of total search volume (CTR at position 1 ≈ 31.6%, round to 30%)
      const potential30 = Math.round(searchVolume * 0.30)
      return { date: row.date, searchVolume, traffic, potential30 }
    })
  }, [effectiveHighlightedIds, series, volumeMap, volumeSeries, hasVolumes])

  // Highlighted median groups (for median chart overlay)
  const highlightedMedianGroups = useMemo(() => {
    if (!activeId || chartMode !== 'median') return []
    return medianGroups.filter(g => g.id === activeId)
  }, [activeId, chartMode, medianGroups])

  // Static — only changes when data changes
  // Filter bgKeywords to only keywords that have at least one data point in the visible range
  // This avoids rendering empty SVG paths for keywords with no data (significant perf gain)
  const bgKeywords = useMemo(() => {
    const hasData = new Set<string>()
    for (const row of series) {
      for (const kw of keywords) {
        if (row[kw.id] != null) hasData.add(kw.id)
      }
    }
    // Exclure les keywords déjà dans HighlightChart
    const highlightedSet = nonActionHighlightedIds ?? new Set<string>()
    return keywords
      .filter(k => hasData.has(k.id) && !highlightedSet.has(k.id))
      .map(k => ({ id: k.id, keyword: k.keyword }))
  }, [keywords, series, nonActionHighlightedIds])
  const allKwIds = useMemo(() => keywords.map(k => k.id), [keywords])

  // Legend — only changes when viewMode/data changes
  const legendItems: Meta[] = useMemo(() => {
    if (viewMode === 'keyword') return keywords.map(k => { const td = trendData[k.id]; return { id: k.id, label: k.keyword, color: td?.color ?? TREND_WHITE, positionLabel: td?.positionLabel, delta: td?.delta ?? 0, volume: volumeMap[k.id] ?? null } })
    const base: (BaseMeta & { source?: 'imported' | 'manual' })[] = viewMode === 'keyword_category' ? kwCategories : viewMode === 'url' ? urlMeta : urlCategories
    return base.map(item => ({ ...item, stats: computeGroupStats(groupToKwIds[item.id] ?? [], trendData) }))
  }, [viewMode, keywords, kwCategories, urlMeta, urlCategories, trendData, groupToKwIds, volumeMap])

  // Sort/filter — changes on searchQuery/sortMode (user interaction, not hover)
  const sortedAndFilteredLegend = useMemo(() => {
    let items = legendItems
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); items = items.filter(i => i.label.toLowerCase().includes(q)) }
    const sorted = [...items]
    const tot = (m: Meta) => { const s = m.stats; return s ? s.gain + s.neutral + s.loss + s.noData + s.stale100 : 0 }
    const isStale = (m: Meta) => viewMode === 'keyword' && trendData[m.id]?.trend === 'stale100'
    if (viewMode === 'keyword') {
      sorted.sort((a, b) => {
        const aS = isStale(a) ? 1 : 0, bS = isStale(b) ? 1 : 0
        if (aS !== bS) return aS - bS
        if (sortMode === 'alpha') return a.label.localeCompare(b.label, 'fr')
        if (sortMode === 'gainloss') return gainLossAsc ? (a.delta ?? 0) - (b.delta ?? 0) : (b.delta ?? 0) - (a.delta ?? 0)
        if (sortMode === 'volume') return (volumeMap[b.id] ?? 0) - (volumeMap[a.id] ?? 0)
        if (sortMode === 'pos_start') {
          const af = trendData[a.id]?.first ?? 999, bf = trendData[b.id]?.first ?? 999
          return af - bf  // meilleure position (petit chiffre) en premier
        }
        if (sortMode === 'pos_end') {
          const al = trendData[a.id]?.last ?? 999, bl = trendData[b.id]?.last ?? 999
          return al - bl
        }
        return 0
      })
    } else {
      if (sortMode === 'alpha') sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
      else if (sortMode === 'count') sorted.sort((a, b) => tot(b) - tot(a))
      else if (sortMode === 'gainloss') sorted.sort((a, b) => gainLossAsc ? (b.stats?.loss ?? 0) - (a.stats?.loss ?? 0) : (b.stats?.gain ?? 0) - (a.stats?.gain ?? 0))
    }
    return sorted
  }, [legendItems, searchQuery, sortMode, gainLossAsc, viewMode, trendData, volumeMap])

  // Detail panel data for locked item OR selected action
  const lockedDetail = useMemo(() => {
    // Action selected → show associated keywords
    if (selectedAction && actionHighlightedIds) {
      const tmap = actionTrendMap ?? trendData
      const items = [...actionHighlightedIds]
        .map(kid => {
          const kw = keywords.find(k => k.id === kid)
          const td = tmap[kid]
          if (!kw || td?.trend === 'noData') return null
          return { id: kid, label: kw.keyword, color: td?.color ?? TREND_WHITE, positionLabel: td?.positionLabel, delta: td?.delta ?? 0 }
        })
        .filter(Boolean) as { id: string; label: string; color: string; positionLabel?: string; delta?: number }[]
      items.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
      return { type: 'keywords' as const, items }
    }

    if (!lockedItem) return null

    if (viewMode === 'keyword') {
      const urlId = kwUrlMap[lockedItem]
      if (!urlId) return null
      const urlObj = urlMeta.find(u => u.id === urlId)
      return { type: 'url' as const, items: urlObj ? [{ id: urlObj.id, label: urlObj.label, color: urlObj.color }] : [] }
    }

    const kwIds = groupToKwIds[lockedItem] ?? []
    const items = kwIds.map(kid => {
      const kw = keywords.find(k => k.id === kid)
      const td = trendData[kid]
      return { id: kid, label: kw?.keyword ?? kid, color: td?.color ?? TREND_WHITE, positionLabel: td?.positionLabel, delta: td?.delta ?? 0 }
    }).sort((a, b) => a.label.localeCompare(b.label, 'fr'))

    return { type: 'keywords' as const, items }
  }, [lockedItem, selectedAction, actionHighlightedIds, actionTrendMap, viewMode, kwUrlMap, urlMeta, groupToKwIds, keywords, trendData])

  // Audit — only changes when trendData changes (data load)
  const auditStats = useMemo(() => {
    const e = Object.values(trendData)
    const g = e.filter(x => x.trend === 'gain'), l = e.filter(x => x.trend === 'loss'), n = e.filter(x => x.trend === 'neutral'), nd = e.filter(x => x.trend === 'noData'), s100 = e.filter(x => x.trend === 'stale100')
    const wd = e.filter(x => x.first != null && x.last != null && x.first < 100 && x.last < 100)
    // Exclude keywords outside top 50 from avg calculations
    const realGains = g.filter(x => x.last != null && x.last < 100)
    const realLosses = l.filter(x => x.last != null && x.last < 100)
    const ag = realGains.length ? Math.round(realGains.reduce((s, x) => s + x.delta, 0) / realGains.length * 10) / 10 : 0
    const al = realLosses.length ? Math.round(Math.abs(realLosses.reduce((s, x) => s + x.delta, 0) / realLosses.length) * 10) / 10 : 0
    // Lost = keywords that dropped out of top 50 or disappeared
    const lost = e.filter(x => (x.last != null && x.last >= 100 && x.first != null && x.first < 100) || (x.trend === 'noData' && x.first != null)).length
    return { total: e.length, gains: g.length, losses: l.length, neutrals: n.length, noData: nd.length, stale100: s100.length, avgGain: ag, avgLoss: al, lost,
      top3Now: wd.filter(x => x.last! <= 3).length, top3Old: wd.filter(x => x.first! <= 3).length,
      top4_10Now: wd.filter(x => x.last! >= 4 && x.last! <= 10).length, top4_10Old: wd.filter(x => x.first! >= 4 && x.first! <= 10).length,
      top11_30Now: wd.filter(x => x.last! >= 11 && x.last! <= 30).length, top11_30Old: wd.filter(x => x.first! >= 11 && x.first! <= 30).length }
  }, [trendData])

  // ── STABLE CALLBACKS (never change → LegendItem memo works) ──────────
  // Single mutable ref object instead of 3 separate refs + 3 useEffects
  const hoverCtx = useRef({ lockedItem, multiSelect, viewMode })
  hoverCtx.current.lockedItem = lockedItem
  hoverCtx.current.multiSelect = multiSelect
  hoverCtx.current.viewMode = viewMode

  const handleHover = useCallback((id: string) => {
    const { lockedItem, multiSelect, viewMode } = hoverCtx.current
    if (!lockedItem && !multiSelect.size) setHovered({ type: viewMode, id })
  }, [setHovered])

  const handleLeave = useCallback(() => {
    const { lockedItem, multiSelect } = hoverCtx.current
    if (!lockedItem && !multiSelect.size) setHovered(null)
  }, [setHovered])

  const handleClick = useCallback((id: string) => {
    if (viewMode === 'keyword') {
      // Multi-select mode for keywords
      setMultiSelect(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setLockedItem(null)
    } else {
      // Single select for groups
      if (lockedItem === id) { setLockedItem(null); setHovered(null) }
      else { setLockedItem(id); setHovered({ type: viewMode, id }) }
      setMultiSelect(new Set())
    }
  }, [lockedItem, viewMode, setHovered])

  const handleClickAction = useCallback((a: Action | null) => setSelectedAction(a), [])
  const handleStatHover = useCallback((key: string) => { if (!lockedStat) setStatHover(key) }, [lockedStat])
  const handleStatLeave = useCallback(() => { if (!lockedStat) setStatHover(null) }, [lockedStat])
  const handleStatClick = useCallback((key: string) => {
    if (lockedStat === key) { setLockedStat(null); setStatHover(null) }
    else { setLockedStat(key); setStatHover(key) }
  }, [lockedStat])

  // Detail breakdown for ANY highlighted set (legend hover, stat hover, or locked)
  const detailSource = useMemo(() => {
    if (activeId) {
      const item = legendItems.find(i => i.id === activeId)
      return item?.label ?? null
    }
    if (selectedAction) return `⚡ ${selectedAction.name}`
    if (activeStat) return activeStat
    return null
  }, [activeId, selectedAction, activeStat, legendItems])

  const selectionDetail = useMemo(() => {
    const ids = effectiveHighlightedIds
    if (!ids || !ids.size) return null

    const kwList = keywords.filter(k => ids.has(k.id))
    let gains = 0, losses = 0, neutrals = 0, noData = 0, stale = 0
    const urlIds = new Set<string>()

    for (const kw of kwList) {
      const td = trendData[kw.id]
      if (td?.trend === 'gain') gains++
      else if (td?.trend === 'loss') losses++
      else if (td?.trend === 'neutral') neutrals++
      else if (td?.trend === 'stale100') stale++
      else noData++
      const uid = kwUrlMap[kw.id]
      if (uid) urlIds.add(uid)
    }

    // Exclude keywords outside top 50 from delta avg
    const realDeltas = kwList
      .filter(k => { const td = trendData[k.id]; return td && td.last != null && td.last < 100 && td.delta !== 0 })
      .map(k => trendData[k.id]!.delta)
    const avgDelta = realDeltas.length ? Math.round(realDeltas.reduce((a, b) => a + b, 0) / realDeltas.length * 10) / 10 : 0
    const lost = kwList.filter(k => {
      const td = trendData[k.id]
      return (td?.last != null && td.last >= 100 && td?.first != null && td.first < 100) || (td?.trend === 'noData' && td?.first != null)
    }).length

    return {
      total: kwList.length,
      gains, losses, neutrals, noData, stale,
      urls: urlIds.size,
      lost,
      avgDelta,
    }
  }, [effectiveHighlightedIds, keywords, trendData, kwUrlMap])

  // ── CONSTANTS ────────────────────────────────────────────────────────────
  const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
    { id: 'keyword', label: 'Mots-clés' }, { id: 'keyword_category', label: 'Catég. mots-clés' },
    { id: 'url', label: 'URLs' }, { id: 'url_category', label: 'Catég. URLs' },
  ]
  const SORT_KW: { id: SortMode; label: string }[] = [
    { id: 'alpha', label: 'A→Z' },
    { id: 'gainloss', label: gainLossAsc ? '↓ Pertes' : '↑ Gains' },
    { id: 'pos_start', label: 'Pos. début' },
    { id: 'pos_end', label: 'Pos. fin' },
    { id: 'volume', label: 'Vol.' },
  ]
  const SORT_GROUP: { id: SortMode; label: string }[] = [{ id: 'alpha', label: 'A→Z' }, { id: 'count', label: '# MC' }, { id: 'gainloss', label: gainLossAsc ? '↓ Pertes' : '↑ Gains' }]
  const activeSortModes = viewMode === 'keyword' ? SORT_KW : SORT_GROUP
  const showMedianToggle = true  // available in all views

  if (loading) return <SkeletonChart />

  return (
    <div className="flex flex-col gap-2" style={{ height: 'calc(100vh - 115px)' }}>
      <style>{`
        .tracker-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .tracker-scroll::-webkit-scrollbar-track { background: transparent; }
        .tracker-scroll::-webkit-scrollbar-thumb { background: #317979; border-radius: 99px; }
        .tracker-scroll::-webkit-scrollbar-thumb:hover { background: #a3f1eb; }
        .tracker-scroll { scrollbar-width: thin; scrollbar-color: #317979 transparent; }

        /* Global scrollbar — same style, applied if page-level scroll appears */
        html, body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #317979; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #a3f1eb; }
        * { scrollbar-width: thin; scrollbar-color: #317979 transparent; }
      `}</style>

      {/* ══ GRAPHIQUE — pleine largeur, 50% hauteur ══ */}
      <div className="flex-shrink-0" style={{ height: '50vh' }}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm" style={{filter: 'brightness(0) invert(1)'}}>📅</span>
          <input type="date" value={pendingRange.from} onChange={e => setPendingRange(p => ({ ...p, from: e.target.value }))}
            className="rounded-md px-2 py-1 text-xs font-mono focus:outline-none"
            style={{ background: '#0d1f1f', border: `1px solid ${pendingChanged ? '#f59e0b' : '#317979'}`, color: C_WHITE }} />
          <span className="text-[10px]" style={{color: C_PRIMARY}}>→</span>
          <input type="date" value={pendingRange.to} onChange={e => setPendingRange(p => ({ ...p, to: e.target.value }))}
            className="rounded-md px-2 py-1 text-xs font-mono focus:outline-none"
            style={{ background: '#0d1f1f', border: `1px solid ${pendingChanged ? '#f59e0b' : '#317979'}`, color: C_WHITE }} />
          {pendingChanged && (
            <>
              <button
                onClick={() => setDateRange(pendingRange)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{ background: '#317979', color: '#071212' }}>
                Appliquer
              </button>
              <button
                onClick={() => setPendingRange(dateRange)}
                className="px-2 py-1 rounded-md text-xs transition-colors"
                style={{ color: '#4a7a7a' }}>
                ✕
              </button>
            </>
          )}

          {hasVolumes && (
            <div className="flex rounded p-0.5 ml-1" style={{background:'#0d1f1f'}}>
              <button onClick={() => setDisplayMode('position')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={displayMode==='position'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}} >Position</button>
              <button onClick={() => setDisplayMode('volume')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={displayMode==='volume'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}} >Volume</button>
            </div>
          )}

          {displayMode === 'position' && showMedianToggle && (
            <div className="flex rounded p-0.5 ml-1" style={{background:'#0d1f1f'}}>
              <button onClick={() => setChartMode('keywords')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={chartMode==='keywords'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}} >MC</button>
              <button onClick={() => setChartMode('median')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={chartMode==='median'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}} >Moy.</button>
            </div>
          )}

          {/* Action color mode — by category or by owner */}
          {actionOwners.length > 0 && displayMode === 'position' && (
            <div className="flex rounded p-0.5 ml-1" style={{background:'#0d1f1f'}}>
              <button onClick={() => setActionColorMode('category')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={actionColorMode==='category'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}}>Catég.</button>
              <button onClick={() => setActionColorMode('owner')} className="px-2 py-0.5 rounded text-[10px] transition-colors"
                style={actionColorMode==='owner'?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}}>Owner</button>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {multiSelect.size > 0 && (
              <button onClick={() => { setMultiSelect(new Set()); setHovered(null) }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ background: `${C_PRIMARY}22`, border: `1px solid ${C_PRIMARY}`, color: C_LIGHT }}>
                <span>{multiSelect.size} sél.</span>
                <span style={{ color: C_PRIMARY }}>✕</span>
              </button>
            )}
            {displayMode === 'position' && [
              { c: TREND_GREEN, l: '↑' }, { c: TREND_RED, l: '↓' }, { c: TREND_WHITE, l: '=' },
              { c: TREND_YELLOW, l: 'N/A' }, { c: TREND_DARK, l: '100+' }
            ].map(x => (
              <div key={x.l} className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.c }} />
                <span className="text-[8px]" style={{color:'#4a7a7a'}}>{x.l}</span>
              </div>
            ))}
            {displayMode === 'volume' && [
              { c: C_LIGHT, l: 'Trafic estimé', solid: true },
              { c: '#f59e0b', l: 'Objectif 30%', dash: true },
              { c: C_PRIMARY, l: 'Vol. potentiel', faint: true },
            ].map(x => (
              <div key={x.l} className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.c }} />
                <span className="text-[8px]" style={{color:'#4a7a7a'}}>{x.l}</span>
              </div>
            ))}
            <span className="text-[10px] ml-1" style={{color:'#4a7a7a'}}>{keywords.length}mc · {importDates.size} import{importDates.size > 1 ? 's' : ''} / {dates.length}j</span>
          </div>
        </div>

        {/* Graph pleine largeur */}
        <div className="relative rounded-xl p-3 border" style={{ height: 'calc(50vh - 34px)', background: '#071212', borderColor: '#1a3535' }}>
          {displayMode === 'volume' ? (
            <VolumeChart data={filteredVolumeSeries} />
          ) : series.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{color:'#317979'}}><p>Aucune donnée</p><p className="text-sm">Importez un CSV.</p></div>
          ) : chartMode === 'median' ? (
            <UnifiedMedianChart
              medianSeries={medianSeries}
              groups={medianGroups}
              highlightedGroups={highlightedMedianGroups}
            />
          ) : (
            <div className="relative w-full h-full">
              {/* BgChart: stable, never re-renders on hover */}
              <div className="absolute inset-0">
                <BgChart series={series} bgKeywords={bgKeywords} importDates={importDates} hasSelection={!!(nonActionHighlightedIds && nonActionHighlightedIds.size > 0)} />
              </div>
              {/* HighlightChart: hover overlay — only 1-N lines, re-renders on hover */}
              <div className="absolute inset-0 pointer-events-none">
                <HighlightChart
                  series={series}
                  highlightedKeywords={highlightedKeywords}
                  actionKeywords={actionHighlightedKeywords}
                  actionSeries={actionNulledSeries}
                />
              </div>
              <ActionFlagsOverlay
                actions={relevantActions} dates={dates} series={series}
                kwUrlMap={kwUrlMap} allKwIds={allKwIds}
                selectedActionId={selectedAction?.id ?? null} onClickAction={handleClickAction}
              />
            </div>
          )}
        </div>
      </div>

      {/* ══ PARTIE BASSE — flex-1, 3 colonnes ══ */}
      <div className="flex gap-2 flex-1 min-h-0">

        {/* ── Colonne 1 : Récapitulatif ── */}
        <div className="flex flex-col rounded-xl overflow-hidden min-w-0" style={{ flex: '0 0 260px', background: '#071212', border: '1px solid #1a3535' }}>
          <div className="px-3 py-2 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #1a3535' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{color: C_PRIMARY}}>
              {chartMode === 'median' && avgModeAuditStats ? 'Moyennes' : 'Récapitulatif'}
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#0d1f1f', color: '#4a7a7a' }}>
              {chartMode === 'median' && avgModeAuditStats ? avgModeAuditStats.total : auditStats.total} mc
            </span>
          </div>
          <div className="tracker-scroll flex-1 overflow-auto px-3 py-2 flex flex-col gap-2.5">
            {chartMode === 'median' && avgModeAuditStats ? (
              <>
                <div>
                  <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Tendances</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <StatCard label="hausse" value={avgModeAuditStats.gains} color={TREND_GREEN} />
                    <StatCard label="baisse" value={avgModeAuditStats.losses} color={TREND_RED} />
                    <StatCard label="stable" value={avgModeAuditStats.neutrals} color={C_WHITE} />
                  </div>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Positions</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <StatCard label="gain moy." value={`+${avgModeAuditStats.avgGain}`} color={TREND_GREEN} />
                    <StatCard label="perte moy." value={`-${avgModeAuditStats.avgLoss}`} color={TREND_RED} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Tendances</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <StatCard label="hausse" value={auditStats.gains} color={TREND_GREEN}
                      statKey="gain" isActive={activeStat==='gain'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                    <StatCard label="baisse" value={auditStats.losses} color={TREND_RED}
                      statKey="loss" isActive={activeStat==='loss'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                    <StatCard label="stable" value={auditStats.neutrals} color={C_WHITE}
                      statKey="neutral" isActive={activeStat==='neutral'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                  </div>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Positions</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <StatCardEvo label="top 3" current={auditStats.top3Now} previous={auditStats.top3Old} color={C_LIGHT}
                      statKey="top3" isActive={activeStat==='top3'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                    <StatCardEvo label="4–10" current={auditStats.top4_10Now} previous={auditStats.top4_10Old} color={C_PRIMARY}
                      statKey="top4_10" isActive={activeStat==='top4_10'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                    <StatCardEvo label="11–30" current={auditStats.top11_30Now} previous={auditStats.top11_30Old} color="#2a8080"
                      statKey="top11_30" isActive={activeStat==='top11_30'} onHover={handleStatHover} onLeave={handleStatLeave} onClick={handleStatClick} />
                  </div>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>État</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <StatCard label="perdus" value={auditStats.lost} color="#f87171" />
                    <StatCard label="N/A" value={auditStats.noData} color={TREND_YELLOW} />
                    <StatCard label="hors 50" value={auditStats.stale100} color={TREND_DARK} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Colonne 2 : Détail sélection ── */}
        <div className="flex flex-col rounded-xl overflow-hidden min-w-0" style={{ flex: '0 0 260px', background: '#071212', border: '1px solid #1a3535' }}>
          <div className="px-3 py-2 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #1a3535' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{color: C_PRIMARY}}>Détail</span>
            {detailSource
              ? <span className="text-[9px] truncate max-w-32 px-1.5 py-0.5 rounded font-mono" style={{ background: '#0d1f1f', color: C_LIGHT }}>{detailSource}</span>
              : <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#0d1f1f', color: '#2a5050' }}>—</span>
            }
          </div>
          {selectionDetail ? (
            <div className="tracker-scroll flex-1 overflow-auto px-3 py-2 flex flex-col gap-2.5">
              <div>
                <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Tendances</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <StatCard label="hausse" value={selectionDetail.gains} color={TREND_GREEN} />
                  <StatCard label="baisse" value={selectionDetail.losses} color={TREND_RED} />
                  <StatCard label="stable" value={selectionDetail.neutrals} color={C_WHITE} />
                </div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>Positions</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatCard label="courbes" value={selectionDetail.total} color={C_LIGHT} />
                  <StatCard label="Δ moyen" value={selectionDetail.avgDelta > 0 ? `+${selectionDetail.avgDelta}` : `${selectionDetail.avgDelta}`}
                    color={selectionDetail.avgDelta > 0 ? TREND_GREEN : selectionDetail.avgDelta < 0 ? TREND_RED : C_WHITE} />
                </div>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-widest mb-1.5" style={{color:'#2a5050'}}>État</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <StatCard label="perdus" value={selectionDetail.lost} color="#f87171" />
                  <StatCard label="N/A" value={selectionDetail.noData} color={TREND_YELLOW} />
                  <StatCard label="hors 50" value={selectionDetail.stale} color={TREND_DARK} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#0d1f1f' }}>
                <span style={{color:'#2a5050', fontSize: '16px'}}>↗</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{color:'#2a5050'}}>
                Survolez ou cliquez<br/>un élément de la légende
              </p>
            </div>
          )}
        </div>

        {/* ── Colonne 3 : Navigation / légende ── */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0 rounded-xl px-3 py-2" style={{ background: '#071212', border: '1px solid #1a3535' }}>
          {/* Controls */}
          <div className="flex gap-1.5 items-center flex-shrink-0">
            <select value={viewMode} onChange={e => { setViewMode(e.target.value as ViewMode); setHovered(null); setLockedItem(null); setSearchQuery(''); setSortMode('alpha') }}
              className="rounded px-2 py-0.5 text-[11px] focus:outline-none cursor-pointer appearance-none"
              style={{ background: '#0d1f1f', border: '1px solid #317979', color: C_WHITE,
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23317979' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
              {VIEW_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <input type="text" placeholder="Rechercher…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="rounded px-2 py-0.5 text-[11px] flex-1 focus:outline-none"
              style={{ background: '#0d1f1f', border: '1px solid #1a3535', color: C_WHITE }} />
            <div className="flex gap-px rounded p-0.5 flex-shrink-0" style={{background:'#0d1f1f'}}>
              {activeSortModes.map(m => (
                <button key={m.id} onClick={() => {
                  if (m.id === 'gainloss' && sortMode === 'gainloss') setGainLossAsc(p => !p)
                  else setSortMode(m.id)
                }} className="px-2 py-0.5 rounded text-[9px] transition-colors"
                  style={sortMode===m.id?{background:C_PRIMARY,color:C_WHITE}:{color:'#4a7a7a'}}>{m.label}</button>
              ))}
            </div>
            {multiSelect.size > 0 && (
              <button onClick={() => { setMultiSelect(new Set()); setHovered(null) }}
                className="px-2 py-0.5 rounded text-[9px] whitespace-nowrap flex-shrink-0"
                style={{ background: '#1a3535', color: C_LIGHT }}>
                ✕ ({multiSelect.size})
              </button>
            )}
            <p className="text-[8px] flex-shrink-0" style={{color:'#2a6060'}}>{searchQuery ? `${sortedAndFilteredLegend.length}/${legendItems.length}` : legendItems.length} él.</p>
          </div>

          {/* Legend list */}
          <div className="tracker-scroll flex-1 overflow-y-auto flex flex-col gap-px min-h-0">
            {sortedAndFilteredLegend.length === 0 ? (
              <p className="text-[10px] text-center mt-4 px-2" style={{color:'#2a6060'}}>{searchQuery ? 'Aucun résultat.' : viewMode !== 'keyword' ? 'Aucune catégorie.' : 'Aucune donnée.'}</p>
            ) : sortedAndFilteredLegend.map(item => (
              <LegendItem key={item.id} id={item.id} color={item.color} label={item.label}
                positionLabel={item.positionLabel} volume={item.volume} stats={item.stats} sourceBadge={(item as any).source}
                isActive={multiSelect.has(item.id) || activeId === item.id}
                onHover={handleHover} onLeave={handleLeave} onClick={handleClick} />
            ))}
          </div>

          {/* Detail locked items */}
          {(lockedItem || selectedAction) && lockedDetail && (
            <div className="tracker-scroll border-t pt-1 flex flex-col gap-px max-h-28 overflow-y-auto flex-shrink-0" style={{borderColor:'#1a3535'}}>
              <div className="flex items-center justify-between px-1">
                <span className="text-[8px] font-semibold uppercase" style={{color:C_PRIMARY}}>{lockedDetail.type === 'keywords' ? `${lockedDetail.items.length} mc` : 'URL'}</span>
                {lockedDetail.type === 'keywords' && lockedDetail.items.length > 1 && (
                  <div className="flex gap-px">
                    <button onClick={() => { setDetailSortMode('alpha'); setDetailSortAsc(false) }} className="text-[7px] px-1 rounded" style={detailSortMode==='alpha'?{background:'#1a3535',color:C_WHITE}:{color:'#4a7a7a'}}>AZ</button>
                    <button onClick={() => { if (detailSortMode === 'gainloss') setDetailSortAsc(p => !p); else setDetailSortMode('gainloss') }} className="text-[7px] px-1 rounded" style={detailSortMode==='gainloss'?{background:'#1a3535',color:C_WHITE}:{color:'#4a7a7a'}}>{detailSortAsc ? '↓' : '↑'}</button>
                    {hasVolumes && <button onClick={() => setDetailSortMode('volume')} className="text-[7px] px-1 rounded" style={detailSortMode==='volume'?{background:'#1a3535',color:C_WHITE}:{color:'#4a7a7a'}}>Vol</button>}
                  </div>
                )}
                <button onClick={() => { setLockedItem(null); setHovered(null); setSelectedAction(null) }} className="text-[8px] ml-1" style={{color:'#4a7a7a'}}>✕</button>
              </div>
              {(() => {
                const sorted = [...lockedDetail.items]
                if (detailSortMode === 'gainloss') sorted.sort((a, b) => detailSortAsc ? ((a as any).delta ?? 0) - ((b as any).delta ?? 0) : ((b as any).delta ?? 0) - ((a as any).delta ?? 0))
                else if (detailSortMode === 'volume') sorted.sort((a, b) => (volumeMap[b.id] ?? 0) - (volumeMap[a.id] ?? 0))
                else sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
                return sorted.map(d => (
                  <div key={d.id} className="flex items-center gap-1 px-1 py-px rounded"
                    onMouseEnter={e => (e.currentTarget.style.background='#0d1f1f')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] truncate" style={{color:'#a3c4c4'}}>{d.label}</span>
                    <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                      {(d as any).positionLabel && <span className="text-[8px] font-mono" style={{color:'#4a7a7a'}}>({(d as any).positionLabel})</span>}
                      {volumeMap[d.id] != null && <span className="text-[7px] font-mono" style={{color:C_LIGHT, opacity:0.6}}>{volumeMap[d.id]}</span>}
                    </span>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* URL panel — shown for any active selection */}
          {effectiveHighlightedIds && effectiveHighlightedIds.size > 0 && onNavigateToActions && (
            <div className="flex-shrink-0" style={{ borderTop: '1px solid #1a3535' }}>
              <UrlPanel
                urlIds={[...selectedUrlIds]}
                urlMeta={urlMeta}
                onCreateAction={() => onNavigateToActions([...selectedUrlIds])}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}