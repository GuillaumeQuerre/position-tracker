import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'
import type { Action, ActionCategory, Owner, UnrankedUrl, RoadmapAction } from '../types/actions'

export function useActions() {
  const { projectId } = useAppStore()
  const [actions, setActions]         = useState<Action[]>([])
  const [roadmap, setRoadmap]         = useState<RoadmapAction[]>([])
  const [categories, setCategories]   = useState<ActionCategory[]>([])
  const [owners, setOwners]           = useState<Owner[]>([])
  const [unrankedUrls, setUnrankedUrls] = useState<UnrankedUrl[]>([])
  const [loading, setLoading]         = useState(true)

  // silent=true → background sync, no setLoading(true) (preserves optimistic state)
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [catsRes, ownersRes, actsRes, linksRes, unrankedRes] = await Promise.all([
      supabase.from('action_categories').select('id, name, color').order('name'),
      supabase.from('owners').select('id, name, color').order('name'),
      supabase.from('actions')
        .select('id, name, date, is_global, category_id, owner_id, notes, time_spent, created_at, action_categories(id, name, color), owners(id, name, color)')
        .order('date', { ascending: false }),
      supabase.from('action_urls').select('action_id, url_id, unranked_url_id'),
      supabase.from('unranked_urls').select('id, url, visible').order('url'),
    ])
    setCategories(catsRes.data ?? [])
    setOwners(ownersRes.error ? [] : (ownersRes.data ?? []))
    setUnrankedUrls(unrankedRes.error ? [] : unrankedRes.data ?? [])

    let actsData: any[] = actsRes.data ?? []
    if (actsRes.error) {
      const { data } = await supabase.from('actions')
        .select('id, name, date, is_global, category_id, owner_id, notes, created_at, action_categories(id, name, color), owners(id, name, color)')
        .order('date', { ascending: false })
      if (data) {
        actsData = data.map(a => ({ ...a, time_spent: null }))
      } else {
        const { data: d2 } = await supabase.from('actions')
          .select('id, name, date, is_global, category_id, notes, created_at, action_categories(id, name, color)')
          .order('date', { ascending: false })
        actsData = (d2 ?? []).map(a => ({ ...a, time_spent: null, owner_id: null, owners: null }))
      }
    }
    let linksData = linksRes.data ?? []
    if (linksRes.error) {
      const { data } = await supabase.from('action_urls').select('action_id, url_id')
      linksData = (data ?? []).map(l => ({ ...l, unranked_url_id: null }))
    }
    const urlMap: Record<string, string[]> = {}, unrankedMap: Record<string, string[]> = {}
    for (const l of linksData) {
      if (l.url_id) { (urlMap[l.action_id] ??= []).push(l.url_id) }
      if (l.unranked_url_id) { (unrankedMap[l.action_id] ??= []).push(l.unranked_url_id) }
    }
    setActions(actsData.map(a => ({
      id: a.id, name: a.name, date: a.date, is_global: a.is_global,
      category_id: a.category_id, category: a.action_categories as any,
      owner_id: (a as any).owner_id ?? null, owner: (a as any).owners as Owner | undefined,
      notes: a.notes ?? undefined, time_spent: a.time_spent ?? undefined,
      url_ids: urlMap[a.id] ?? [], unranked_url_ids: unrankedMap[a.id] ?? [],
      created_at: a.created_at,
    }) as Action))

    const rmRes = await supabase.from('roadmap_actions')
      .select('id, name, planned_date, category_id, owner_id, is_global, notes, priority, status, estimated_time, created_at, action_categories(id, name, color), owners(id, name, color)')
      .neq('status', 'done').order('priority')
    if (!rmRes.error && rmRes.data) {
      const { data: rmLinks } = await supabase.from('roadmap_action_urls').select('roadmap_action_id, url_id, unranked_url_id')
      const rmUrlMap: Record<string, string[]> = {}, rmUnrankedMap: Record<string, string[]> = {}
      for (const l of rmLinks ?? []) {
        if (l.url_id) { (rmUrlMap[l.roadmap_action_id] ??= []).push(l.url_id) }
        if (l.unranked_url_id) { (rmUnrankedMap[l.roadmap_action_id] ??= []).push(l.unranked_url_id) }
      }
      setRoadmap(rmRes.data.map(r => ({
        id: r.id, name: r.name, planned_date: r.planned_date, category_id: r.category_id,
        category: r.action_categories as any,
        owner_id: (r as any).owner_id ?? null, owner: (r as any).owners as Owner | undefined,
        is_global: r.is_global, notes: r.notes, priority: r.priority as any,
        status: r.status as any, estimated_time: r.estimated_time,
        url_ids: rmUrlMap[r.id] ?? [], unranked_url_ids: rmUnrankedMap[r.id] ?? [],
        created_at: r.created_at,
      }) as RoadmapAction))
    } else { setRoadmap([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const createOwner = useCallback(async (name: string, color: string) => {
    const { data, error } = await supabase.from('owners').insert({ name, color }).select('id').single()
    if (error || !data) return null
    await fetchAll(true); return data.id
  }, [fetchAll])

  const updateOwner = useCallback(async (id: string, name: string, color: string) => {
    await supabase.from('owners').update({ name, color }).eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  const deleteOwner = useCallback(async (id: string) => {
    await supabase.from('owners').delete().eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  const createAction = useCallback(async (input: {
    name: string; date: string; is_global: boolean; category_id: string | null;
    owner_id?: string | null; notes?: string; time_spent?: number
    url_ids: string[]; unranked_url_ids?: string[]
  }) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Action = {
      id: tempId, name: input.name, date: input.date, is_global: input.is_global,
      category_id: input.category_id ?? null, owner_id: input.owner_id ?? null,
      notes: input.notes, time_spent: input.time_spent,
      url_ids: input.url_ids, unranked_url_ids: input.unranked_url_ids ?? [],
      created_at: new Date().toISOString(),
    }
    setActions(prev => [optimistic, ...prev])

    // Include project_id so RLS and chart filtering work
    const base: any = {
      name: input.name, date: input.date, is_global: input.is_global,
      category_id: input.category_id || null, notes: input.notes || null,
      owner_id: input.owner_id || null,
      ...(projectId ? { project_id: projectId } : {}),
    }
    let data: any = null
    if (input.time_spent) {
      const res = await supabase.from('actions').insert({ ...base, time_spent: input.time_spent }).select('id').single()
      data = res.data; if (res.error) data = null
    }
    if (!data) {
      const res = await supabase.from('actions').insert(base).select('id').single()
      data = res.data
      if (res.error) { setActions(prev => prev.filter(a => a.id !== tempId)); return null }
    }
    if (!input.is_global && input.url_ids.length > 0)
      await supabase.from('action_urls').insert(input.url_ids.map(uid => ({ action_id: data.id, url_id: uid })))
    if (!input.is_global && input.unranked_url_ids?.length)
      await supabase.from('action_urls').insert(input.unranked_url_ids.map(uid => ({ action_id: data.id, url_id: null, unranked_url_id: uid })))

    // Replace temp with real id — silent sync in background
    setActions(prev => prev.map(a => a.id === tempId ? { ...a, id: data.id } : a))
    fetchAll(true)
    return data.id
  }, [fetchAll, projectId])

  const updateAction = useCallback(async (id: string, input: {
    name: string; date: string; is_global: boolean; category_id: string | null;
    owner_id?: string | null; notes?: string; time_spent?: number
    url_ids: string[]; unranked_url_ids?: string[]
  }) => {
    setActions(prev => prev.map(a => a.id === id ? {
      ...a, name: input.name, date: input.date, is_global: input.is_global,
      category_id: input.category_id ?? null, owner_id: input.owner_id ?? null,
      notes: input.notes, time_spent: input.time_spent,
      url_ids: input.url_ids, unranked_url_ids: input.unranked_url_ids ?? [],
    } : a))
    const upd: any = { name: input.name, date: input.date, is_global: input.is_global, category_id: input.category_id || null, notes: input.notes || null, owner_id: input.owner_id || null }
    if (input.time_spent) upd.time_spent = input.time_spent
    const { error } = await supabase.from('actions').update(upd).eq('id', id)
    if (error) { delete upd.time_spent; await supabase.from('actions').update(upd).eq('id', id) }
    await supabase.from('action_urls').delete().eq('action_id', id)
    if (!input.is_global && input.url_ids.length > 0)
      await supabase.from('action_urls').insert(input.url_ids.map(uid => ({ action_id: id, url_id: uid })))
    if (!input.is_global && input.unranked_url_ids?.length)
      await supabase.from('action_urls').insert(input.unranked_url_ids.map(uid => ({ action_id: id, url_id: null, unranked_url_id: uid })))
    fetchAll(true)
  }, [fetchAll])

  const deleteAction = useCallback(async (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id))
    await supabase.from('actions').delete().eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  const createRoadmapAction = useCallback(async (input: {
    name: string; planned_date?: string; category_id: string | null; is_global: boolean;
    owner_id?: string | null; notes?: string; priority: string; estimated_time?: number;
    url_ids: string[]; unranked_url_ids?: string[]
  }) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: RoadmapAction = {
      id: tempId, name: input.name, planned_date: input.planned_date ?? null,
      category_id: input.category_id ?? null, owner_id: input.owner_id ?? null,
      is_global: input.is_global, notes: input.notes ?? null,
      priority: input.priority as RoadmapAction['priority'], status: 'backlog',
      estimated_time: input.estimated_time ?? null,
      url_ids: input.url_ids, unranked_url_ids: input.unranked_url_ids ?? [],
      created_at: new Date().toISOString(),
    }
    setRoadmap(prev => [...prev, optimistic])
    const { data, error } = await supabase.from('roadmap_actions').insert({
      name: input.name, planned_date: input.planned_date || null,
      category_id: input.category_id || null, is_global: input.is_global,
      owner_id: input.owner_id || null, notes: input.notes || null,
      priority: input.priority, estimated_time: input.estimated_time || null,
      ...(projectId ? { project_id: projectId } : {}),
    }).select('id').single()
    if (error || !data) { setRoadmap(prev => prev.filter(r => r.id !== tempId)); return null }
    const links: any[] = []
    if (!input.is_global) {
      for (const uid of input.url_ids) links.push({ roadmap_action_id: data.id, url_id: uid })
      for (const uid of (input.unranked_url_ids ?? [])) links.push({ roadmap_action_id: data.id, unranked_url_id: uid })
    }
    if (links.length) await supabase.from('roadmap_action_urls').insert(links)
    setRoadmap(prev => prev.map(r => r.id === tempId ? { ...r, id: data.id } : r))
    fetchAll(true)
    return data.id
  }, [fetchAll, projectId])

  const updateRoadmapAction = useCallback(async (id: string, input: {
    name: string; planned_date?: string; category_id: string | null; is_global: boolean;
    owner_id?: string | null; notes?: string; priority: string; estimated_time?: number; status?: string;
    url_ids: string[]; unranked_url_ids?: string[]
  }) => {
    setRoadmap(prev => prev.map(r => r.id === id ? {
      ...r, name: input.name, planned_date: input.planned_date ?? null,
      category_id: input.category_id ?? null, owner_id: input.owner_id ?? null,
      is_global: input.is_global, notes: input.notes ?? null,
      priority: input.priority as RoadmapAction['priority'],
      estimated_time: input.estimated_time ?? null,
      url_ids: input.url_ids, unranked_url_ids: input.unranked_url_ids ?? [],
    } : r))
    await supabase.from('roadmap_actions').update({
      name: input.name, planned_date: input.planned_date || null,
      category_id: input.category_id || null, is_global: input.is_global,
      owner_id: input.owner_id || null, notes: input.notes || null,
      priority: input.priority, estimated_time: input.estimated_time || null,
      status: input.status || 'backlog',
    }).eq('id', id)
    await supabase.from('roadmap_action_urls').delete().eq('roadmap_action_id', id)
    const links: any[] = []
    if (!input.is_global) {
      for (const uid of input.url_ids) links.push({ roadmap_action_id: id, url_id: uid })
      for (const uid of (input.unranked_url_ids ?? [])) links.push({ roadmap_action_id: id, unranked_url_id: uid })
    }
    if (links.length) await supabase.from('roadmap_action_urls').insert(links)
    fetchAll(true)
  }, [fetchAll])

  const deleteRoadmapAction = useCallback(async (id: string) => {
    setRoadmap(prev => prev.filter(r => r.id !== id))
    await supabase.from('roadmap_actions').delete().eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  const validateRoadmapAction = useCallback(async (id: string, date: string, timeSpent?: number) => {
    const rm = roadmap.find(r => r.id === id); if (!rm) return null
    const actionId = await createAction({
      name: rm.name, date, is_global: rm.is_global, category_id: rm.category_id, owner_id: rm.owner_id,
      notes: rm.notes ?? undefined, time_spent: timeSpent, url_ids: rm.url_ids, unranked_url_ids: rm.unranked_url_ids,
    })
    if (actionId) {
      await supabase.from('roadmap_actions').update({ status: 'done' }).eq('id', id)
      fetchAll(true)
    }
    return actionId
  }, [roadmap, createAction, fetchAll])

  const importUnrankedUrls = useCallback(async (urls: string[]) => {
    const unique = [...new Set(urls.map(u => u.trim()).filter(Boolean))]
    if (!unique.length) return
    await supabase.from('unranked_urls').upsert(unique.map(url => ({ url })), { onConflict: 'url' })
    fetchAll(true)
  }, [fetchAll])

  const toggleUnrankedVisibility = useCallback(async (id: string, visible: boolean) => {
    await supabase.from('unranked_urls').update({ visible }).eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  const deleteUnrankedUrl = useCallback(async (id: string) => {
    await supabase.from('unranked_urls').delete().eq('id', id)
    fetchAll(true)
  }, [fetchAll])

  return {
    actions, roadmap, categories, owners, unrankedUrls, loading,
    createOwner, updateOwner, deleteOwner,
    createAction, updateAction, deleteAction,
    createRoadmapAction, updateRoadmapAction, deleteRoadmapAction, validateRoadmapAction,
    importUnrankedUrls, toggleUnrankedVisibility, deleteUnrankedUrl,
    refetch: fetchAll,
  }
}