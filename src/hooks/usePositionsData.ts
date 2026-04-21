import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import { getKeywordColor } from '../lib/colors'

const CTR_BY_POS: number[] = [0, 0.316, 0.152, 0.098, 0.068, 0.051, 0.038, 0.029, 0.022, 0.018, 0.015]
function getCTR(pos: number): number {
  if (pos < 1 || pos > 100) return 0
  if (pos <= 10) return CTR_BY_POS[pos]
  if (pos <= 20) return 0.01
  if (pos <= 30) return 0.005
  if (pos <= 50) return 0.002
  return 0.0005
}

export function usePositionsData() {
  const { dateRange, projectId } = useAppStore()
  const [data, setData] = useState<any[]>([])
  const [volumeMap, setVolumeMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      let allRows: any[] = []
      let from = 0
      const pageSize = 1000

      while (true) {
        let query = supabase
          .from('positions')
          .select('id, date, position, keyword_id, keywords(id, keyword, category_id), urls(url)')
          .gte('date', dateRange.from)
          .lte('date', dateRange.to)
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (projectId) query = query.eq('project_id', projectId)
        const { data: rows, error } = await query
        if (error || !rows?.length) break
        allRows = allRows.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
      }

      if (cancelled) return

      // Fetch volumes in parallel — resilient to missing column
      const kwIds = [...new Set(allRows.map(r => r.keyword_id).filter(Boolean))]
      const vm: Record<string, number> = {}
      if (kwIds.length > 0) {
        const { data: kwData } = await supabase.from('keywords').select('id, volume').in('id', kwIds)
        for (const kw of kwData ?? []) { if (kw.volume != null) vm[kw.id] = kw.volume }
      }

      if (cancelled) return
      setData(allRows)
      setVolumeMap(vm)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [dateRange, projectId])

  // Fill dates from dateRange (not from data) for exact calendar match
  const dates = useMemo(() => {
    const result: string[] = []
    // Parse as local dates to avoid timezone shift
    const [sy, sm, sd] = dateRange.from.split('-').map(Number)
    const [ey, em, ed] = dateRange.to.split('-').map(Number)
    const start = new Date(sy, sm - 1, sd)
    const end = new Date(ey, em - 1, ed)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      result.push(`${y}-${m}-${day}`)
    }
    return result
  }, [dateRange])

  // Dates that actually have imported data
  const importDates = useMemo(() => new Set(data.map(r => r.date)), [data])

  const keywords = useMemo(() => {
    const m = new Map<string, any>()
    for (const r of data) {
      if (r.keyword_id && !m.has(r.keyword_id)) {
        m.set(r.keyword_id, {
          id: r.keyword_id,
          keyword: r.keywords?.keyword ?? r.keyword_id,
          category_id: r.keywords?.category_id ?? null,
          category: null,
          color: getKeywordColor(m.size),
        })
      }
    }
    return [...m.values()]
  }, [data])

  // Index data by date once — O(n) instead of O(n*m)
  const byDate = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const r of data) {
      let arr = m.get(r.date)
      if (!arr) { arr = []; m.set(r.date, arr) }
      arr.push(r)
    }
    return m
  }, [data])

  const series = useMemo(() =>
    dates.map(date => {
      const entry: Record<string, any> = { date }
      for (const r of byDate.get(date) ?? []) {
        if (r.keyword_id) entry[r.keyword_id] = r.position
      }
      return entry
    })
  , [dates, byDate])

  // rawSeries is identical to series — both use real positions.
  // The chart domain [1,50] handles visual clipping; Recharts clips out-of-domain
  // points to the axis boundary rather than drawing them outside.
  const rawSeries = series

  const hasVolumes = Object.keys(volumeMap).length > 0

  const volumeSeries = useMemo(() => {
    if (!hasVolumes) return []
    return dates.map(date => {
      let searchVolume = 0, traffic = 0
      for (const r of byDate.get(date) ?? []) {
        const vol = volumeMap[r.keyword_id]
        if (vol == null) continue
        searchVolume += vol
        traffic += Math.round(vol * getCTR(r.position))
      }
      const potential30 = Math.round(searchVolume * 0.30)
      return { date, searchVolume, traffic, potential30 }
    })
  }, [dates, byDate, volumeMap, hasVolumes])

  const keywordVolumeSeries = useMemo(() => {
    if (!hasVolumes) return []
    return dates.map(date => {
      const entry: Record<string, any> = { date }
      for (const r of byDate.get(date) ?? []) {
        const vol = volumeMap[r.keyword_id]
        if (vol == null) continue
        entry[`${r.keyword_id}_vol`] = vol
        entry[`${r.keyword_id}_traffic`] = Math.round(vol * getCTR(r.position))
      }
      return entry
    })
  }, [dates, byDate, volumeMap, hasVolumes])

  return { series, rawSeries, volumeSeries, keywordVolumeSeries, keywords, dates, importDates, volumeMap, hasVolumes, loading }
}