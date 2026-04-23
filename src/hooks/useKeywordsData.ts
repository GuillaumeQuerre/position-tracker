import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface KeywordCategory { id: string; name: string; color: string }

export interface Cannibalisation {
  id: string
  keyword_id: string
  keyword: string
  old_url: string
  new_url: string
  detected_at: string
}

export interface Keyword {
  id: string; keyword: string; language: string
  latestPosition: number | null; url: string | null; volume: number | null
  tags: KeywordCategory[]
  cannibalised: boolean
  is_starred: boolean
}

export function useKeywordsData() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [categories, setCategories] = useState<KeywordCategory[]>([])
  const [cannibalisations, setCannibalisations] = useState<Cannibalisation[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [kwRes, catRes, tagRes, posRes, cannRes] = await Promise.all([
      supabase.from('keywords').select('id, keyword, language, volume, is_starred').order('keyword'),
      supabase.from('keyword_categories').select('id, name, color').order('name'),
      supabase.from('keyword_tags').select('keyword_id, category_id, keyword_categories(id, name, color)'),
      supabase.from('positions').select('keyword_id, position, url_id, urls(url)').order('date', { ascending: false }),
      supabase.from('cannibalisation').select('id, keyword_id, detected_at, old_url:old_url_id(url), new_url:new_url_id(url), keywords(keyword)').order('detected_at', { ascending: false }),
    ])

    const latestByKw: Record<string, { position: number; url: string | null }> = {}
    for (const p of posRes.data ?? []) {
      if (!latestByKw[p.keyword_id])
        latestByKw[p.keyword_id] = { position: p.position, url: (p.urls as any)?.url ?? null }
    }

    const tagsByKw: Record<string, KeywordCategory[]> = {}
    for (const t of tagRes.data ?? []) {
      if (!tagsByKw[t.keyword_id]) tagsByKw[t.keyword_id] = []
      if (t.keyword_categories) tagsByKw[t.keyword_id].push(t.keyword_categories as any)
    }

    const cannKwIds = new Set((cannRes.data ?? []).map((c: any) => c.keyword_id))

    setKeywords((kwRes.data ?? []).map((kw: any) => ({
      id: kw.id, keyword: kw.keyword, language: kw.language ?? 'fr',
      latestPosition: latestByKw[kw.id]?.position ?? null,
      url: latestByKw[kw.id]?.url ?? null, volume: kw.volume ?? null,
      tags: tagsByKw[kw.id] ?? [],
      cannibalised: cannKwIds.has(kw.id),
      is_starred: kw.is_starred ?? false,
    })))
    setCategories(catRes.data ?? [])

    setCannibalisations((cannRes.data ?? []).map((c: any) => ({
      id: c.id,
      keyword_id: c.keyword_id,
      keyword: (c.keywords as any)?.keyword ?? '',
      old_url: (c.old_url as any)?.url ?? '',
      new_url: (c.new_url as any)?.url ?? '',
      detected_at: c.detected_at,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })

  const toggleStar = useCallback(async (kwId: string, starred: boolean) => {
    // Optimistic update
    setKeywords(prev => prev.map(k => k.id === kwId ? { ...k, is_starred: starred } : k))
    await supabase.from('keywords').update({ is_starred: starred }).eq('id', kwId)
  }, [])

  const addTag = useCallback(async (kwId: string, catId: string) => {
    await supabase.from('keyword_tags').upsert({ keyword_id: kwId, category_id: catId })
    await loadRef.current()
  }, [])

  const removeTag = useCallback(async (kwId: string, catId: string) => {
    await supabase.from('keyword_tags').delete().eq('keyword_id', kwId).eq('category_id', catId)
    await loadRef.current()
  }, [])

  const createAndAddTag = useCallback(async (kwId: string, name: string, color: string) => {
    const { data: cat } = await supabase.from('keyword_categories').upsert({ name, color }, { onConflict: 'name' }).select('id').single()
    if (cat) await addTag(kwId, cat.id)
  }, [addTag])

  const bulkAddTag = useCallback(async (kwIds: string[], catId: string) => {
    await supabase.from('keyword_tags').upsert(kwIds.map(kid => ({ keyword_id: kid, category_id: catId })))
    await loadRef.current()
  }, [])

  const applyRegexTag = useCallback(async (pattern: string, catId: string): Promise<number> => {
    let re: RegExp; try { re = new RegExp(pattern, 'i') } catch { return 0 }
    const matched = keywords.filter(k => re.test(k.keyword))
    if (!matched.length) return 0
    await supabase.from('keyword_tags').upsert(matched.map(k => ({ keyword_id: k.id, category_id: catId })))
    await loadRef.current()
    return matched.length
  }, [keywords])

  const deleteCategory = useCallback(async (catId: string) => {
    await supabase.from('keyword_tags').delete().eq('category_id', catId)
    await supabase.from('keyword_categories').delete().eq('id', catId)
    await loadRef.current()
  }, [])

  return { keywords, categories, cannibalisations, loading, toggleStar, addTag, removeTag, createAndAddTag, bulkAddTag, applyRegexTag, deleteCategory, reload: load }
}