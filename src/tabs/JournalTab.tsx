import { useEffect, useState, useMemo, useCallback } from 'react'
import { useActions } from '../hooks/useActions'
import { usePositionsData } from '../hooks/usePositionsData'
import { supabase } from '../lib/supabase'
import { format, parseISO, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { PeriodImpact, PageType } from '../types/actions'

type ViewMode = 'chrono' | 'thematic' | 'pagetype' | 'timetrack'

const C = {
  bg: '#071212', surface: '#0d1f1f', border: '#1a3535',
  primary: '#317979', light: '#a3f1eb', text: '#f6f6f6',
  muted: '#4a7a7a', dim: '#2a5050',
}
const GREEN = '#317979', RED = '#ef4444', AMBER = '#c5a55a'

function evoColor(d: number) { return d > 0 ? GREEN : d < 0 ? RED : C.muted }

function formatDuration(m: number) {
  if (!m) return '—'
  const h = Math.floor(m / 60), mn = m % 60
  if (h && mn) return `${h}h${mn.toString().padStart(2, '0')}`
  if (h) return `${h}h`
  return `${mn}min`
}

function fmtDate(d: string) {
  try { return format(parseISO(d), 'd MMM yyyy', { locale: fr }) } catch { return d }
}

function fmtMonth(d: string) {
  try { return format(parseISO(d + '-01'), 'MMMM yyyy', { locale: fr }) } catch { return d }
}

// ── Compute impact ──────────────────────────────────────────────────────────
function computeImpact(kwIds: string[], actionDate: string, targetDate: string, series: any[]): PeriodImpact | null {
  const actionRow = series.find(r => r.date === actionDate)
  const targetRow = [...series].filter(r => r.date <= targetDate).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!actionRow || !targetRow || targetRow.date === actionDate) return null
  let gains = 0, losses = 0, stable = 0, totalDelta = 0, totalPos = 0, count = 0
  for (const kwId of kwIds) {
    const before = actionRow[kwId], after = targetRow[kwId]
    if (before == null || after == null) continue
    const delta = before - after
    if (delta > 0) gains++; else if (delta < 0) losses++; else stable++
    totalDelta += delta; totalPos += after; count++
  }
  if (!count) return null
  return { gains, losses, stable, avgDelta: Math.round(totalDelta / count * 10) / 10, avgPosAfter: Math.round(totalPos / count * 10) / 10 }
}

// ── ImpactBadge ─────────────────────────────────────────────────────────────
function ImpactBadge({ impact, label }: { impact: PeriodImpact | null; label: string }) {
  if (!impact) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: C.bg, minWidth: 52 }}>
      <span style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.dim }}>—</span>
    </div>
  )
  const col = evoColor(impact.avgDelta)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: C.bg, border: `1px solid ${col}20`, minWidth: 52 }}>
      <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: col }}>
        {impact.avgDelta > 0 ? '+' : ''}{impact.avgDelta}
      </span>
      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 8, color: GREEN, fontFamily: 'monospace' }}>{impact.gains}↑</span>
        <span style={{ fontSize: 8, color: RED, fontFamily: 'monospace' }}>{impact.losses}↓</span>
      </div>
    </div>
  )
}

// ── StatPill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: C.bg, borderLeft: `2px solid ${color ?? C.border}` }}>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: color ?? C.text }}>{value}</span>
      <span style={{ fontSize: 9, color: C.dim }}>{label}</span>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${accent ? accent + '30' : C.border}`, borderRadius: 14, padding: '16px 20px', marginBottom: 8 }}>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function JournalTab() {
  const { actions, categories } = useActions()
  const { series, keywords, dates } = usePositionsData()

  const [viewMode, setViewMode] = useState<ViewMode>('chrono')
  const [pageTypes, setPageTypes]       = useState<PageType[]>([])
  const [urlPageTypes, setUrlPageTypes] = useState<Record<string, string[]>>({})
  const [kwTagMap, setKwTagMap]         = useState<Record<string, string[]>>({})
  const [kwUrlMap, setKwUrlMap]         = useState<Record<string, string>>({})
  const [kwCategories, setKwCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [newTypeName, setNewTypeName]   = useState('')
  const [newTypeColor, setNewTypeColor] = useState('#317979')

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
      for (const r of upts ?? []) { if (!upt[r.url_id]) upt[r.url_id] = []; upt[r.url_id].push(r.page_type_id) }
      setUrlPageTypes(upt)
      const km: Record<string, string[]> = {}
      for (const t of kwTags ?? []) { if (!km[t.keyword_id]) km[t.keyword_id] = []; km[t.keyword_id].push(t.category_id) }
      setKwTagMap(km)
      const kwU: Record<string, string> = {}
      for (const p of pos ?? []) { if (p.url_id) kwU[p.keyword_id] = p.url_id }
      setKwUrlMap(kwU)
    }
    load()
  }, [])

  const urlToKwIds = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [kwId, urlId] of Object.entries(kwUrlMap)) { if (!m[urlId]) m[urlId] = []; m[urlId].push(kwId) }
    return m
  }, [kwUrlMap])

  // ── Chrono ──────────────────────────────────────────────────────────────
  const chronoEntries = useMemo(() => {
    if (viewMode !== 'chrono') return []
    return actions.map(action => {
      const cat = categories.find(c => c.id === action.category_id)
      let kwIds: string[] = action.is_global
        ? keywords.map(k => k.id)
        : action.url_ids.flatMap(uid => urlToKwIds[uid] ?? [])
      const d7  = format(addDays(parseISO(action.date), 7),  'yyyy-MM-dd')
      const d1m = format(addDays(parseISO(action.date), 30), 'yyyy-MM-dd')
      const d3m = format(addDays(parseISO(action.date), 90), 'yyyy-MM-dd')
      return {
        action,
        categoryName:  cat?.name  ?? null,
        categoryColor: cat?.color ?? C.muted,
        kwCount: kwIds.length,
        at7d:  computeImpact(kwIds, action.date, d7,  series),
        at1m:  computeImpact(kwIds, action.date, d1m, series),
        at3m:  computeImpact(kwIds, action.date, d3m, series),
      }
    })
  }, [viewMode, actions, categories, keywords, urlToKwIds, series])

  // ── Thématique ───────────────────────────────────────────────────────────
  const thematicGroups = useMemo(() => {
    if (viewMode !== 'thematic' || !series.length) return []
    const firstRow = series[0], lastRow = series[series.length - 1]
    return kwCategories.map(cat => {
      const kwIds = keywords.filter(k => (kwTagMap[k.id] ?? []).includes(cat.id)).map(k => k.id)
      if (!kwIds.length) return null
      let gains = 0, losses = 0, stable = 0, totalDelta = 0, totalOld = 0, totalNew = 0, count = 0
      for (const id of kwIds) {
        const before = firstRow[id], after = lastRow[id]
        if (before == null || after == null) continue
        const delta = before - after
        if (delta > 0) gains++; else if (delta < 0) losses++; else stable++
        totalDelta += delta; totalOld += before; totalNew += after; count++
      }
      if (!count) return null
      const avgDelta = Math.round(totalDelta / count * 10) / 10
      return {
        category: cat, total: kwIds.length, gains, losses, stable,
        avgPosNow: Math.round(totalNew / count * 10) / 10,
        avgPosOld: Math.round(totalOld / count * 10) / 10,
        delta: avgDelta,
        trend: avgDelta > 1 ? 'rising' : avgDelta < -1 ? 'falling' : 'stable',
      }
    }).filter(Boolean)
  }, [viewMode, kwCategories, keywords, kwTagMap, series])

  // ── PageType ─────────────────────────────────────────────────────────────
  const pageTypeGroups = useMemo(() => {
    if (viewMode !== 'pagetype' || !series.length) return []
    const firstRow = series[0], lastRow = series[series.length - 1]
    return pageTypes.map(pt => {
      const urlIds = Object.entries(urlPageTypes).filter(([, ptIds]) => ptIds.includes(pt.id)).map(([uid]) => uid)
      const kwIds  = urlIds.flatMap(uid => urlToKwIds[uid] ?? [])
      if (!kwIds.length) return null
      let gains = 0, losses = 0, totalDelta = 0, totalNew = 0, count = 0
      for (const id of kwIds) {
        const before = firstRow[id], after = lastRow[id]
        if (before == null || after == null) continue
        const delta = before - after
        if (delta > 0) gains++; else if (delta < 0) losses++
        totalDelta += delta; totalNew += after; count++
      }
      if (!count) return null
      const avgDelta = Math.round(totalDelta / count * 10) / 10
      return { pageType: pt, urlIds, total: kwIds.length, gains, losses, delta: avgDelta, avgPosNow: Math.round(totalNew / count * 10) / 10 }
    }).filter(Boolean)
  }, [viewMode, pageTypes, urlPageTypes, urlToKwIds, series])

  // ── TimeTrack ────────────────────────────────────────────────────────────
  const timeTrackMonths = useMemo(() => {
    if (viewMode !== 'timetrack') return []
    const byMonth = new Map<string, typeof actions>()
    for (const a of actions) {
      const mk = a.date.slice(0, 7)
      if (!byMonth.has(mk)) byMonth.set(mk, [])
      byMonth.get(mk)!.push(a)
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([mk, mas]) => ({
      monthKey: mk, monthLabel: fmtMonth(mk),
      totalTime: mas.reduce((s, a) => s + (a.time_spent ?? 0), 0),
      actions: [...mas].sort((a, b) => b.date.localeCompare(a.date)),
    }))
  }, [viewMode, actions])

  const addPageType = useCallback(async () => {
    if (!newTypeName.trim()) return
    await supabase.from('page_types').insert({ name: newTypeName.trim(), color: newTypeColor })
    setNewTypeName('')
    const { data } = await supabase.from('page_types').select('id, name, color, description')
    setPageTypes(data ?? [])
  }, [newTypeName, newTypeColor])

  const MODES: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'chrono',    label: 'Chronologique',    icon: '◷' },
    { id: 'thematic',  label: 'Thématique',        icon: '◈' },
    { id: 'pagetype',  label: 'Typ. de page',      icon: '◻' },
    { id: 'timetrack', label: 'Suivi temps',        icon: '◎' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 140px)' }}>

      {/* ── Barre de navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 9, fontSize: 12,
              fontWeight: viewMode === m.id ? 600 : 400,
              background: viewMode === m.id ? C.primary : 'transparent',
              color: viewMode === m.id ? C.bg : C.muted,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 11 }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>
          {dates.length}j · {keywords.length} mc · {actions.length} actions
        </div>
      </div>

      {/* ── Contenu ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>

        {/* ── CHRONOLOGIQUE ── */}
        {viewMode === 'chrono' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chronoEntries.length === 0
              ? <div style={{ textAlign: 'center', paddingTop: 60, color: C.dim, fontSize: 13 }}>Aucune action enregistrée.</div>
              : chronoEntries.map(e => (
                <div key={e.action.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: '14px 18px',
                  borderLeft: `3px solid ${e.categoryColor}`,
                }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.action.name}</span>
                      {e.categoryName && (
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                          color: e.categoryColor, background: e.categoryColor + '18', border: `1px solid ${e.categoryColor}40` }}>
                          {e.categoryName}
                        </span>
                      )}
                      {e.action.is_global && (
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, color: AMBER, background: AMBER + '15', border: `1px solid ${AMBER}40` }}>
                          Global
                        </span>
                      )}
                      {e.action.time_spent != null && e.action.time_spent > 0 && (
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, color: C.muted, background: C.bg, fontFamily: 'monospace' }}>
                          ⏱ {formatDuration(e.action.time_spent)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {fmtDate(e.action.date)}
                      {e.kwCount > 0 && <span style={{ marginLeft: 8, color: C.dim }}>· {e.kwCount} mc</span>}
                    </div>
                    {e.action.notes && <p style={{ fontSize: 11, color: C.dim, marginTop: 4, fontStyle: 'italic' }}>{e.action.notes}</p>}
                  </div>

                  {/* Impact */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ImpactBadge impact={e.at7d}  label="7j" />
                    <ImpactBadge impact={e.at1m}  label="1m" />
                    <ImpactBadge impact={e.at3m}  label="3m" />
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── THÉMATIQUE ── */}
        {viewMode === 'thematic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {thematicGroups.length === 0
              ? <div style={{ textAlign: 'center', paddingTop: 60, color: C.dim, fontSize: 13 }}>Taggez vos mots-clés dans l'onglet Mots-clés pour voir les analyses.</div>
              : (thematicGroups as any[]).map(g => (
                <Card key={g.category.id} accent={g.category.color}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.category.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{g.category.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                      background: g.trend === 'rising' ? GREEN + '15' : g.trend === 'falling' ? RED + '15' : C.bg,
                      color: g.trend === 'rising' ? GREEN : g.trend === 'falling' ? RED : C.muted,
                      border: `1px solid ${g.trend === 'rising' ? GREEN : g.trend === 'falling' ? RED : C.border}40`,
                    }}>
                      {g.trend === 'rising' ? '↑ Hausse' : g.trend === 'falling' ? '↓ Baisse' : '= Stable'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: C.dim }}>{g.total} mc</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <StatPill label="pos. moy."   value={g.avgPosNow} />
                    <StatPill label="évol."        value={g.delta > 0 ? `+${g.delta}` : `${g.delta}`} color={evoColor(g.delta)} />
                    <StatPill label="hausse"       value={g.gains} color={GREEN} />
                    <StatPill label="baisse"       value={g.losses} color={RED} />
                    <StatPill label="pos. initiale" value={g.avgPosOld} />
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                    {g.trend === 'rising' && g.delta > 5
                      ? `Thématique en progression : gain moyen de ${g.delta} positions. ${g.gains} mot${g.gains > 1 ? 's' : ''}-clé${g.gains > 1 ? 's' : ''} en hausse.`
                      : g.trend === 'falling' && g.delta < -5
                      ? `Régression détectée : ${g.delta} positions en moyenne. ${g.losses} mot${g.losses > 1 ? 's' : ''}-clé${g.losses > 1 ? 's' : ''} en baisse.`
                      : `Stabilité relative. Position moyenne : ${g.avgPosNow} · ${g.total} mots-clés suivis.`}
                  </p>
                </Card>
              ))
            }
          </div>
        )}

        {/* ── TYPOLOGIE DE PAGE ── */}
        {viewMode === 'pagetype' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Ajouter un type */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: 12, padding: '10px 14px', border: `1px solid ${C.border}` }}>
              <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                placeholder="Nouveau type de page…"
                onKeyDown={e => e.key === 'Enter' && addPageType()}
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none' }} />
              <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)}
                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', padding: 2 }} />
              <button onClick={addPageType} disabled={!newTypeName.trim()} style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: newTypeName.trim() ? C.primary : C.dim, color: C.bg,
              }}>Ajouter</button>
            </div>

            {pageTypeGroups.length === 0
              ? <div style={{ textAlign: 'center', paddingTop: 48, color: C.dim, fontSize: 13 }}>
                  {pageTypes.length === 0 ? 'Créez des typologies de page pour commencer.' : 'Associez des typologies à vos URLs.'}
                </div>
              : (pageTypeGroups as any[]).map(g => (
                <Card key={g.pageType.id} accent={g.pageType.color}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: g.pageType.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{g.pageType.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: C.dim }}>{g.urlIds.length} URL · {g.total} mc</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <StatPill label="pos. moy." value={g.avgPosNow} />
                    <StatPill label="évol."     value={g.delta > 0 ? `+${g.delta}` : `${g.delta}`} color={evoColor(g.delta)} />
                    <StatPill label="hausse"    value={g.gains} color={GREEN} />
                    <StatPill label="baisse"    value={g.losses} color={RED} />
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                    {g.delta > 3
                      ? `Bon niveau de performance (+${g.delta} positions en moyenne). ${g.gains} mot${g.gains > 1 ? 's' : ''}-clé${g.gains > 1 ? 's' : ''} en hausse.`
                      : g.delta < -3
                      ? `Régression détectée (${g.delta} pos.). Vérifiez le template, le maillage et la profondeur de crawl.`
                      : `Stabilité. Position moyenne : ${g.avgPosNow} · ${g.urlIds.length} URL${g.urlIds.length > 1 ? 's' : ''}.`}
                  </p>
                </Card>
              ))
            }
          </div>
        )}

        {/* ── SUIVI TEMPS ── */}
        {viewMode === 'timetrack' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {timeTrackMonths.length === 0
              ? <div style={{ textAlign: 'center', paddingTop: 60, color: C.dim, fontSize: 13 }}>Aucune action avec du temps enregistré.</div>
              : <>
                  {/* Total global */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, borderRadius: 12, padding: '12px 18px', border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Temps total enregistré</span>
                    <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: C.light }}>
                      {formatDuration(timeTrackMonths.reduce((s, m) => s + m.totalTime, 0))}
                    </span>
                  </div>

                  {timeTrackMonths.map(month => (
                    <div key={month.monthKey}>
                      {/* Header mois */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{month.monthLabel}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: C.muted }}>{formatDuration(month.totalTime)}</span>
                      </div>

                      {/* Table */}
                      <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                              {['Date', 'Action', 'Catégorie', 'Notes', 'Temps'].map((h, i) => (
                                <th key={h} style={{ padding: '8px 12px', textAlign: i === 4 ? 'right' : 'left', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {month.actions.map((action, ai) => {
                              const cat = categories.find(c => c.id === action.category_id)
                              return (
                                <tr key={action.id} style={{ borderTop: ai > 0 ? `1px solid ${C.border}40` : 'none' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <td style={{ padding: '8px 12px', color: C.muted, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(action.date)}</td>
                                  <td style={{ padding: '8px 12px', color: C.text, fontWeight: 500 }}>{action.name}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {cat
                                      ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, fontWeight: 600, color: cat.color, background: cat.color + '18', border: `1px solid ${cat.color}40` }}>{cat.name}</span>
                                      : <span style={{ fontSize: 10, color: C.dim }}>—</span>}
                                  </td>
                                  <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                                    <span style={{ fontSize: 11, color: C.dim, fontStyle: 'italic', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.notes || '—'}</span>
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    {action.time_spent
                                      ? <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: C.light }}>{formatDuration(action.time_spent)}</span>
                                      : <span style={{ color: C.dim, fontSize: 10 }}>—</span>}
                                  </td>
                                </tr>
                              )
                            })}
                            {/* Total mois */}
                            <tr style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                              <td colSpan={4} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 10, color: C.muted }}>
                                {month.actions.length} action{month.actions.length > 1 ? 's' : ''}
                              </td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: C.light }}>
                                {formatDuration(month.totalTime)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </>
            }
          </div>
        )}
      </div>
    </div>
  )
}