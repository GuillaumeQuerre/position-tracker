import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProjectStore } from '../store/useProjectStore'

export interface UrlCategory { id: string; name: string; color: string }

export interface UrlRow {
  id: string; url: string; latestPosition: number | null
  keywordCount: number; totalVolume: number | null
  keywords: { keyword: string; volume: number | null }[]
  tags: UrlCategory[]
}

export function useUrlsData() {
  const [urls, setUrls] = useState<UrlRow[]>([])
  const [categories, setCategories] = useState<UrlCategory[]>([])
  const [loading, setLoading] = useState(true)
  const { activeProjectId } = useProjectStore()

  async function load() {
    setLoading(true)

    const [urlRes, catRes, tagRes, posRes] = await Promise.all([
      supabase.from('urls').select('id, url').eq('project_id', activeProjectId).order('url'),
      supabase.from('url_categories').select('id, name, color').eq('project_id', activeProjectId).order('name'),
      supabase.from('url_tags').select('url_id, category_id, url_categories(id, name, color)'),
      supabase.from('positions').select('keyword_id, url_id, position, date, keywords(id, keyword)').eq('project_id', activeProjectId).not('url_id', 'is', null).order('date', { ascending: false }),
    ])

    // Tags by URL
    const tagsByUrl: Record<string, UrlCategory[]> = {}
    for (const t of tagRes.data ?? []) {
      if (!tagsByUrl[t.url_id]) tagsByUrl[t.url_id] = []
      if (t.url_categories) tagsByUrl[t.url_id].push(t.url_categories as any)
    }

    // Positions by URL
    const posByUrl: Record<string, any[]> = {}
    for (const p of posRes.data ?? []) {
      if (p.url_id) { if (!posByUrl[p.url_id]) posByUrl[p.url_id] = []; posByUrl[p.url_id].push(p) }
    }

    setUrls((urlRes.data ?? []).map((u: any) => {
      const ups = posByUrl[u.id] ?? []
      const kwMap = new Map<string, { keyword: string; volume: number | null }>()
      for (const p of ups) {
        if ((p.keywords as any)?.keyword && !kwMap.has(p.keyword_id)) {
          kwMap.set(p.keyword_id, { keyword: (p.keywords as any).keyword, volume: null })
        }
      }
      return {
        id: u.id, url: u.url,
        latestPosition: ups[0]?.position ?? null,
        keywordCount: kwMap.size, totalVolume: null,
        keywords: [...kwMap.values()],
        tags: tagsByUrl[u.id] ?? [],
      }
    }))
    setCategories(catRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })

  const addTag = useCallback(async (urlId: string, catId: string) => {
    await supabase.from('url_tags').upsert({ url_id: urlId, category_id: catId }); await loadRef.current()
  }, [])

  const removeTag = useCallback(async (urlId: string, catId: string) => {
    await supabase.from('url_tags').delete().eq('url_id', urlId).eq('category_id', catId); await loadRef.current()
  }, [])

  const createAndAddTag = useCallback(async (urlId: string, name: string, color: string) => {
    const { data: cat } = await supabase.from('url_categories').upsert({ name, color }, { onConflict: 'name' }).select('id').single()
    if (cat) await addTag(urlId, cat.id)
  }, [addTag])

  const bulkAddTag = useCallback(async (urlIds: string[], catId: string) => {
    await supabase.from('url_tags').upsert(urlIds.map(uid => ({ url_id: uid, category_id: catId }))); await loadRef.current()
  }, [])

  const applyRegexTag = useCallback(async (pattern: string, catId: string): Promise<number> => {
    let re: RegExp; try { re = new RegExp(pattern, 'i') } catch { return 0 }
    const matched = urls.filter(u => re.test(u.url))
    if (!matched.length) return 0
    await supabase.from('url_tags').upsert(matched.map(u => ({ url_id: u.id, category_id: catId }))); await loadRef.current()
    return matched.length
  }, [urls])

  const deleteCategory = useCallback(async (catId: string) => {
    await supabase.from('url_tags').delete().eq('category_id', catId)
    await supabase.from('url_categories').delete().eq('id', catId); await loadRef.current()
  }, [])

  return { urls, categories, loading, addTag, removeTag, createAndAddTag, bulkAddTag, applyRegexTag, deleteCategory, reload: load }
}