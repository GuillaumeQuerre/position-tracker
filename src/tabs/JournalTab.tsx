import { useEffect, useState, useMemo, useCallback } from 'react'
import { useActions } from '../hooks/useActions'
import { usePositionsData } from '../hooks/usePositionsData'
import { supabase } from '../lib/supabase'
import { format, parseISO, addDays, addMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { PeriodImpact, PageType } from '../types/actions'

type ViewMode = 'chrono' | 'thematic' | 'pagetype' | 'timetrack'

const TREND_GREEN = '#22c55e', TREND_RED = '#ef4444', TREND_WHITE = '#e5e7eb'

function evoColor(d: number) { return d > 0 ? TREND_GREEN : d < 0 ? TREND_RED : TREND_WHITE }

function formatDuration(minutes: number): string {
  if (!minutes) return '0h'
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h && m) return `${h}h${m.toString().padStart(2, '0')}`
  if (h) return `${h}h`
  return `${m}min`
}

function formatHours(minutes: number): string {
  if (!minutes) return '0h'
  const h = minutes / 60
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`
}

// ── Small pill ─────────────────────────────────────────────────────────────
function Pill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5 border-l-2 bg-gray-900/60" style={{ borderLeftColor: color ?? '#4b5563' }}>
      <span className="text-[10px] font-bold font-mono" style={{ color: color ?? TREND_WHITE }}>{value}</span>
      <span className="text-[8px] text-gray-500">{label}</span>
    </div>
  )
}

function ImpactBadge({ impact, label }: { impact: PeriodImpact | null; label: string }) {
  if (!impact) return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded bg-[#0a1628] min-w-[48px]">
      <span className="text-[8px] text-gray-600 uppercase font-medium">{label}</span>
      <span className="text-[10px] text-gray-700">—</span>
    </div>
  )

  const ec = evoColor(impact.avgDelta)
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded bg-[#0a1628] border border-[#1a2744] min-w-[48px]">
      <span className="text-[8px] text-gray-500 uppercase font-medium">{label}</span>
      <span className="text-sm font-bold font-mono" style={{ color: ec }}>
        {impact.avgDelta > 0 ? '+' : ''}{Math.round(impact.avgDelta * 10) / 10}
      </span>
      <div className="flex gap-0.5">
        <span className="text-[7px] font-mono" style={{ color: TREND_GREEN }}>{impact.gains}↑</span>
        <span className="text-[7px] font-mono" style={{ color: TREND_RED }}>{impact.losses}↓</span>
      </div>
    </div>
  )
}

// ── Compute impact at a date offset ────────────────────────────────────────
function computeImpact(
  kwIds: string[], actionDate: string, targetDate: string,
  allPositions: any[]
): PeriodImpact | null {
  const actionRow = allPositions.find(r => r.date === actionDate)
  // Find closest row to targetDate
  const targetRows = allPositions.filter(r => r.date <= targetDate).sort((a, b) => b.date.localeCompare(a.date))
  const targetRow = targetRows[0]

  if (!actionRow || !targetRow || targetRow.date === actionDate) return null

  let gains = 0, losses = 0, stable = 0, totalDelta = 0, count = 0, totalPos = 0
  for (const kwId of kwIds) {
    const before = actionRow[kwId]
    const after = targetRow[kwId]
    if (before == null || after == null) continue
    const delta = before - after // positive = improved
    if (delta > 0) gains++
    else if (delta < 0) losses++
    else stable++
    totalDelta += delta
    totalPos += after
    count++
  }

  if (!count) return null
  return {
    gains, losses, stable,
    avgDelta: Math.round(totalDelta / count * 10) / 10,
    avgPosAfter: Math.round(totalPos / count * 10) / 10,
  }
}

// ════════════════════════════════════════════════════════════════════════════
export function JournalTab() {
  const { actions, categories } = useActions()
  const { series, keywords, dates } = usePositionsData()

  const [viewMode, setViewMode] = useState<ViewMode>('chrono')
  const [pageTypes, setPageTypes] = useState<PageType[]>([])
  const [urlPageTypes, setUrlPageTypes] = useState<Record<string, string[]>>({})
  const [kwTagMap, setKwTagMap] = useState<Record<string, string[]>>({})
  const [kwUrlMap, setKwUrlMap] = useState<Record<string, string>>({})
  const [kwCategories, setKwCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState('#6366f1')

  useEffect(() => {
    async function load() {
      const [{ data: pts }, { data: upts }, { data: kwTags }, { data: pos }, { data: kwCats }] = await Promise.all([
        supabase.from('page_types').select('id, name, color, description'),
        supabase.from('url_page_types').select('url_id, page_type_id'),
        supabase.from('keyword_tags').select('keyword_id, category_id'),
        supabase.from('positions').select('keyword_id, url_id').not('url_id', 'is', null),
        supabase.from('keyword_categories').select('id, name, color'),
      ])

      setPageTypes(pts ?? [])
      setKwCategories(kwCats ?? [])

      const upt: Record<string, string[]> = {}
      for (const r of upts ?? []) {
        if (!upt[r.url_id]) upt[r.url_id] = []
        upt[r.url_id].push(r.page_type_id)
      }
      setUrlPageTypes(upt)

      const km: Record<string, string[]> = {}
      for (const t of kwTags ?? []) {
        if (!km[t.keyword_id]) km[t.keyword_id] = []
        km[t.keyword_id].push(t.category_id)
      }
      setKwTagMap(km)

      const kwU: Record<string, string> = {}
      for (const p of pos ?? []) {
        if (p.url_id) kwU[p.keyword_id] = p.url_id
      }
      setKwUrlMap(kwU)
    }
    load()
  }, [])

  // ── URL → KW IDs reverse map ────────────────────────────────────────────
  const urlToKwIds = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [kwId, urlId] of Object.entries(kwUrlMap)) {
      if (!m[urlId]) m[urlId] = []
      m[urlId].push(kwId)
    }
    return m
  }, [kwUrlMap])

  // ── All positions data for impact computation ───────────────────────────
  const allPositions = useMemo(() => {
  return series
  }, [series])

  // ════════════════════════════════════════════════════════════════════════
  // MODE 1: Chronologique
  // ════════════════════════════════════════════════════════════════════════
  const chronoEntries = useMemo(() => {
    if (viewMode !== 'chrono') return []

    return actions.map(action => {
      const cat = categories.find(c => c.id === action.category_id)

      // Get kwIds for this action
      let kwIds: string[] = []
      if (action.is_global) {
        kwIds = keywords.map(k => k.id)
      } else {
        for (const urlId of action.url_ids) kwIds.push(...(urlToKwIds[urlId] ?? []))
      }

      const d7 = format(addDays(parseISO(action.date), 7), 'yyyy-MM-dd')
      const d1m = format(addMonths(parseISO(action.date), 1), 'yyyy-MM-dd')
      const d3m = format(addMonths(parseISO(action.date), 3), 'yyyy-MM-dd')

      return {
        action,
        categoryColor: cat?.color ?? '#6b7280',
        categoryName: cat?.name,
        kwIds,
        kwCount: kwIds.length,
        at7d: computeImpact(kwIds, action.date, d7, allPositions),
        at1m: computeImpact(kwIds, action.date, d1m, allPositions),
        at3m: computeImpact(kwIds, action.date, d3m, allPositions),
      }
    }).sort((a, b) => b.action.date.localeCompare(a.action.date))
  }, [viewMode, actions, categories, keywords, urlToKwIds, allPositions])

  // ════════════════════════════════════════════════════════════════════════
  // MODE 2: Thématique
  // ════════════════════════════════════════════════════════════════════════
  const thematicGroups = useMemo(() => {
    if (viewMode !== 'thematic') return []
    if (!series.length) return []

    const firstRow = series[0]
    const lastRow = series[series.length - 1]

    return kwCategories.map(cat => {
      const kwIds = keywords.map(k => k.id).filter(kid => kwTagMap[kid]?.includes(cat.id))
      if (!kwIds.length) return null

      let gains = 0, losses = 0, totalNow = 0, totalOld = 0, count = 0
      for (const kwId of kwIds) {
        const posOld = firstRow?.[kwId]
        const posNow = lastRow?.[kwId]
        if (posOld == null || posNow == null) continue
        const d = posOld - posNow
        if (d > 0) gains++; else if (d < 0) losses++
        totalNow += posNow; totalOld += posOld; count++
      }

      const avgNow = count ? Math.round(totalNow / count * 10) / 10 : 0
      const avgOld = count ? Math.round(totalOld / count * 10) / 10 : 0
      const delta = Math.round((avgOld - avgNow) * 10) / 10
      const trend = delta > 1 ? 'rising' : delta < -1 ? 'falling' : 'stable'

      return {
        category: cat,
        kwIds, avgPosNow: avgNow, avgPosOld: avgOld, delta,
        gains, losses, total: kwIds.length,
        trend: trend as 'rising' | 'falling' | 'stable',
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.delta) - Math.abs(a!.delta)) as any[]
  }, [viewMode, kwCategories, keywords, kwTagMap, series])

  // ════════════════════════════════════════════════════════════════════════
  // MODE 3: Typologie de page
  // ════════════════════════════════════════════════════════════════════════
  const pageTypeGroups = useMemo(() => {
    if (viewMode !== 'pagetype') return []
    if (!series.length) return []

    const firstRow = series[0]
    const lastRow = series[series.length - 1]

    return pageTypes.map(pt => {
      // Find URLs with this page type
      const urlIds = Object.entries(urlPageTypes)
        .filter(([, types]) => types.includes(pt.id))
        .map(([urlId]) => urlId)

      // Find keywords linked to those URLs
      const kwIds: string[] = []
      for (const urlId of urlIds) kwIds.push(...(urlToKwIds[urlId] ?? []))
      if (!kwIds.length) return null

      let gains = 0, losses = 0, totalNow = 0, totalOld = 0, count = 0
      for (const kwId of kwIds) {
        const posOld = firstRow?.[kwId]
        const posNow = lastRow?.[kwId]
        if (posOld == null || posNow == null) continue
        const d = posOld - posNow
        if (d > 0) gains++; else if (d < 0) losses++
        totalNow += posNow; totalOld += posOld; count++
      }

      const avgNow = count ? Math.round(totalNow / count * 10) / 10 : 0
      const avgOld = count ? Math.round(totalOld / count * 10) / 10 : 0
      const delta = Math.round((avgOld - avgNow) * 10) / 10

      return {
        pageType: pt, urlIds, kwIds,
        avgPosNow: avgNow, avgPosOld: avgOld, delta,
        gains, losses, total: kwIds.length,
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.delta) - Math.abs(a!.delta)) as any[]
  }, [viewMode, pageTypes, urlPageTypes, urlToKwIds, series])

  // ── Add page type ────────────────────────────────────────────────────────
  const addPageType = useCallback(async () => {
    if (!newTypeName.trim()) return
    await supabase.from('page_types').insert({ name: newTypeName.trim(), color: newTypeColor })
    setNewTypeName('')
    const { data } = await supabase.from('page_types').select('id, name, color, description')
    setPageTypes(data ?? [])
  }, [newTypeName, newTypeColor])

  // ── Format date ──────────────────────────────────────────────────────────
  const fmtDate = (d: string) => { try { return format(parseISO(d), 'd MMM yyyy', { locale: fr }) } catch { return d } }

  // ════════════════════════════════════════════════════════════════════════
  // MODE 4: Suivi temps — actions grouped by month
  // ════════════════════════════════════════════════════════════════════════
  const timeTrackMonths = useMemo(() => {
    if (viewMode !== 'timetrack') return []

    // Group actions by month
    const byMonth = new Map<string, typeof actions>()
    for (const action of actions) {
      const monthKey = action.date.slice(0, 7) // "2026-03"
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, [])
      byMonth.get(monthKey)!.push(action)
    }

    // Sort months descending
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, monthActions]) => {
        let monthLabel = monthKey
        try { monthLabel = format(parseISO(monthKey + '-01'), 'MMMM yyyy', { locale: fr }) } catch {}
        const totalTime = monthActions.reduce((sum, a) => sum + (a.time_spent ?? 0), 0)
        const sorted = [...monthActions].sort((a, b) => b.date.localeCompare(a.date))
        return { monthKey, monthLabel, totalTime, actions: sorted }
      })
  }, [viewMode, actions])

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'chrono', label: 'Chronologique' },
    { id: 'thematic', label: 'Thématique' },
    { id: 'pagetype', label: 'Typologie de page' },
    { id: 'timetrack', label: 'Suivi temps' },
  ]

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 140px)' }}>

      {/* Mode selector */}
      <div className="flex items-center gap-2">
        <div className="flex bg-[#0a1628] rounded-lg p-0.5 border border-[#1a2744]">
          {MODES.map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)}
              className={`px-4 py-1.5 rounded-md text-xs transition-colors ${viewMode === m.id ? 'bg-[#c5a55a] text-[#0a1628] font-semibold' : 'text-gray-400 hover:text-gray-200'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-600 ml-auto">
          {dates.length} jour{dates.length > 1 ? 's' : ''} · {keywords.length} mc · {actions.length} action{actions.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── CHRONO ── */}
        {viewMode === 'chrono' && (
          <div className="flex flex-col gap-2">
            {chronoEntries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center mt-12">Aucune action enregistrée.</p>
            ) : chronoEntries.map(entry => (
              <div key={entry.action.id} className="bg-[#0f1a2e] border border-[#1a2744] rounded-lg px-4 py-3 flex items-center gap-4">
                {/* Left: color bar + info */}
                <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: entry.categoryColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-100">{entry.action.name}</span>
                    {entry.categoryName && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium"
                        style={{ color: entry.categoryColor, borderColor: entry.categoryColor + '40', backgroundColor: entry.categoryColor + '10' }}>
                        {entry.categoryName}
                      </span>
                    )}
                    {entry.action.time_spent != null && entry.action.time_spent > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a2744] text-gray-400 font-mono">
                        ⏱ {formatDuration(entry.action.time_spent)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-500">{fmtDate(entry.action.date)}</span>
                    <span className="text-[10px] text-gray-600">· {entry.kwCount} mc</span>
                    {entry.action.is_global && <span className="text-[9px] text-[#c5a55a]">· Global</span>}
                  </div>
                  {entry.action.notes && <p className="text-[11px] text-gray-500 mt-1 italic truncate">{entry.action.notes}</p>}
                </div>

                {/* Right: impact badges inline */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <ImpactBadge impact={entry.at7d} label="7j" />
                  <ImpactBadge impact={entry.at1m} label="1m" />
                  <ImpactBadge impact={entry.at3m} label="3m" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── THÉMATIQUE ── */}
        {viewMode === 'thematic' && (
          <div className="flex flex-col gap-3">
            {thematicGroups.length === 0 ? (
              <p className="text-sm text-gray-600 text-center mt-12">Aucune catégorie de mots-clés. Taggez vos mots-clés dans l'onglet Mots-clés.</p>
            ) : thematicGroups.map((g: any) => (
              <div key={g.category.id} className="bg-gray-900 rounded-xl px-5 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.category.color }} />
                  <span className="text-sm font-semibold text-gray-100">{g.category.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    g.trend === 'rising' ? 'bg-green-900/40 text-green-400' :
                    g.trend === 'falling' ? 'bg-red-900/40 text-red-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {g.trend === 'rising' ? '↑ En hausse' : g.trend === 'falling' ? '↓ En baisse' : '= Stable'}
                  </span>
                  <span className="text-[10px] text-gray-600 ml-auto">{g.total} mc</span>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <Pill label="pos. moy." value={g.avgPosNow} />
                  <Pill label="évol." value={g.delta > 0 ? `+${g.delta}` : `${g.delta}`} color={evoColor(g.delta)} />
                  <Pill label="hausse" value={g.gains} color={TREND_GREEN} />
                  <Pill label="baisse" value={g.losses} color={TREND_RED} />
                  <Pill label="ancienne pos." value={g.avgPosOld} />
                </div>

                {/* Analyse contextuelle */}
                <p className="text-[11px] text-gray-500">
                  {g.trend === 'rising' && g.delta > 5
                    ? `Thématique porteuse : gain moyen de ${g.delta} positions. ${g.gains} mot${g.gains > 1 ? 's' : ''}-clé${g.gains > 1 ? 's' : ''} en progression. Potentiel de renforcement sur ce cluster.`
                    : g.trend === 'falling' && g.delta < -5
                    ? `Thématique en difficulté : perte de ${Math.abs(g.delta)} positions en moyenne. ${g.losses} mot${g.losses > 1 ? 's' : ''}-clé${g.losses > 1 ? 's' : ''} en recul. Un audit de contenu et maillage est recommandé.`
                    : g.trend === 'rising'
                    ? `Légère progression sur ce thème (+${g.delta} positions). Continuer le renforcement sémantique.`
                    : g.trend === 'falling'
                    ? `Légère régression (${g.delta} positions). Vérifier la fraîcheur du contenu et les signaux d'engagement.`
                    : `Thème stable. Position moyenne de ${g.avgPosNow}. Opportunité de consolidation si en Top 20.`
                  }
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── TYPOLOGIE DE PAGE ── */}
        {viewMode === 'pagetype' && (
          <div className="flex flex-col gap-3">
            {/* Add page type */}
            <div className="bg-gray-900 rounded-lg px-4 py-3 flex items-center gap-3">
              <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                placeholder="Nouveau type de page…"
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 flex-1" />
              <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)}
                className="w-7 h-7 rounded border border-gray-700 cursor-pointer bg-transparent" />
              <button onClick={addPageType} disabled={!newTypeName.trim()}
                className={`px-3 py-1.5 rounded text-xs font-medium ${newTypeName.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                Ajouter
              </button>
            </div>

            {pageTypeGroups.length === 0 && pageTypes.length === 0 ? (
              <p className="text-sm text-gray-600 text-center mt-8">Créez des typologies de page puis associez-les à vos URLs.</p>
            ) : pageTypeGroups.length === 0 ? (
              <p className="text-sm text-gray-600 text-center mt-8">Associez des typologies à vos URLs pour voir les analyses.</p>
            ) : pageTypeGroups.map((g: any) => (
              <div key={g.pageType.id} className="bg-gray-900 rounded-xl px-5 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: g.pageType.color }} />
                  <span className="text-sm font-semibold text-gray-100">{g.pageType.name}</span>
                  <span className="text-[10px] text-gray-600 ml-auto">{g.urlIds.length} URL{g.urlIds.length > 1 ? 's' : ''} · {g.total} mc</span>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <Pill label="pos. moy." value={g.avgPosNow} />
                  <Pill label="évol." value={g.delta > 0 ? `+${g.delta}` : `${g.delta}`} color={evoColor(g.delta)} />
                  <Pill label="hausse" value={g.gains} color={TREND_GREEN} />
                  <Pill label="baisse" value={g.losses} color={TREND_RED} />
                </div>

                <p className="text-[11px] text-gray-500">
                  {g.delta > 3
                    ? `Ce type de page performe bien (+${g.delta} positions en moyenne). Les modifications structurelles ont un impact positif sur ${g.gains} mot${g.gains > 1 ? 's' : ''}-clé${g.gains > 1 ? 's' : ''}.`
                    : g.delta < -3
                    ? `Régression détectée sur ce type de page (${g.delta} positions). Vérifier le template, le maillage interne et la profondeur de crawl. ${g.losses} mot${g.losses > 1 ? 's' : ''}-clé${g.losses > 1 ? 's' : ''} impacté${g.losses > 1 ? 's' : ''}.`
                    : `Stabilité sur ce type de page. Position moyenne : ${g.avgPosNow}. ${g.urlIds.length} URL${g.urlIds.length > 1 ? 's' : ''} concernée${g.urlIds.length > 1 ? 's' : ''}.`
                  }
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── SUIVI TEMPS ── */}
        {viewMode === 'timetrack' && (
          <div className="flex flex-col gap-4">
            {timeTrackMonths.length === 0 ? (
              <p className="text-sm text-gray-600 text-center mt-12">Aucune action avec du temps enregistré.</p>
            ) : (
              <>
                {/* Total global */}
                <div className="bg-gray-900 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Temps total enregistré</span>
                  <span className="text-lg font-bold font-mono text-indigo-400">
                    {formatHours(timeTrackMonths.reduce((s, m) => s + m.totalTime, 0))}
                  </span>
                </div>

                {timeTrackMonths.map(month => (
                  <div key={month.monthKey} className="flex flex-col gap-2">
                    {/* Month header */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-gray-200 capitalize">{month.monthLabel}</span>
                      <span className="text-sm font-bold font-mono text-gray-300">{formatHours(month.totalTime)}</span>
                    </div>

                    {/* Actions table */}
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800 bg-gray-900">
                            <th className="py-2 px-3 text-left text-[10px] text-gray-500 font-medium w-24">Date</th>
                            <th className="py-2 px-3 text-left text-[10px] text-gray-500 font-medium">Action</th>
                            <th className="py-2 px-3 text-left text-[10px] text-gray-500 font-medium w-28">Catégorie</th>
                            <th className="py-2 px-3 text-left text-[10px] text-gray-500 font-medium">Notes</th>
                            <th className="py-2 px-3 text-right text-[10px] text-gray-500 font-medium w-20">Temps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {month.actions.map(action => {
                            const cat = categories.find(c => c.id === action.category_id)
                            return (
                              <tr key={action.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                                <td className="py-2 px-3 text-xs text-gray-500 font-mono">{fmtDate(action.date)}</td>
                                <td className="py-2 px-3">
                                  <span className="text-xs text-gray-200">{action.name}</span>
                                </td>
                                <td className="py-2 px-3">
                                  {cat ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                                      style={{ color: cat.color, borderColor: cat.color + '40', backgroundColor: cat.color + '15' }}>
                                      {cat.name}
                                    </span>
                                  ) : <span className="text-[10px] text-gray-600">—</span>}
                                </td>
                                <td className="py-2 px-3 max-w-xs">
                                  <span className="text-[11px] text-gray-500 italic truncate block">{action.notes || '—'}</span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {action.time_spent ? (
                                    <span className="text-xs font-mono font-semibold text-gray-300">{formatHours(action.time_spent)}</span>
                                  ) : (
                                    <span className="text-[10px] text-gray-700">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {/* Month total row */}
                          <tr className="bg-gray-900/80">
                            <td colSpan={4} className="py-2 px-3 text-right text-[10px] text-gray-500 font-medium">
                              {month.actions.length} action{month.actions.length > 1 ? 's' : ''}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="text-xs font-mono font-bold text-indigo-400">{formatHours(month.totalTime)}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}