import { useState, useEffect, useMemo, useRef, memo } from 'react'
import { useActions } from '../hooks/useActions'
import { supabase } from '../lib/supabase'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Action, RoadmapAction } from '../types/actions'
import { SkeletonActions } from '../components/SkeletonLoader'

const C = { bg: '#071212', border: '#1a3535', surface: '#0d1f1f', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

type SubTab = 'done' | 'roadmap'
interface UrlOption { id: string; url: string; unranked: boolean }

const PRIORITY_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  urgent: { label: 'Urgent', bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-800/50' },
  high:   { label: 'Haute', bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-800/50' },
  medium: { label: 'Moyenne', bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-800/50' },
  low:    { label: 'Basse', bg: 'bg-gray-800', text: 'text-gray-400', border: 'border-gray-700' },
}

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const selected = value ? parseISO(value) : new Date()
  const [viewMonth, setViewMonth] = useState(startOfMonth(selected))
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewMonth])
  return (
    <div className="rounded-lg p-2.5 w-full" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewMonth(m => subMonths(m, 1))} className="px-1.5 py-0.5 rounded text-sm" style={{ color: C.muted }}>‹</button>
        <span className="text-xs font-medium capitalize" style={{ color: C.text }}>{format(viewMonth, 'MMMM yyyy', { locale: fr })}</span>
        <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="px-1.5 py-0.5 rounded text-sm" style={{ color: C.muted }}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['L','M','M','J','V','S','D'].map((d,i) => <div key={i} className="text-[9px] text-center font-medium" style={{ color: C.dim }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const isCurrentMonth = isSameMonth(day, viewMonth)
          const isSelected = !!(value && isSameDay(day, selected))
          const isToday = isSameDay(day, new Date())
          return (
            <button key={ds} onClick={() => onChange(ds)} className="text-[11px] py-1 rounded text-center transition-colors"
              style={isSelected ? { background: C.primary, color: C.bg, fontWeight: 700 }
                : isToday ? { background: C.border, color: C.light, fontWeight: 500 }
                : isCurrentMonth ? { color: '#a3c4c4' } : { color: C.dim }}>
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimeSpentInput({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const hours = Math.floor(value / 60), minutes = value % 60
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg px-2 py-1.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <input type="number" min={0} max={99} value={hours} onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0) * 60 + minutes)} className="bg-transparent w-8 text-sm text-center focus:outline-none font-mono" style={{ color: C.text }} />
        <span className="text-[10px]" style={{ color: C.muted }}>h</span>
      </div>
      <div className="flex items-center gap-1 rounded-lg px-2 py-1.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <input type="number" min={0} max={59} step={5} value={minutes} onChange={e => onChange(hours * 60 + Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className="bg-transparent w-8 text-sm text-center focus:outline-none font-mono" style={{ color: C.text }} />
        <span className="text-[10px]" style={{ color: C.muted }}>min</span>
      </div>
      <div className="flex gap-0.5 ml-1">
        {[15, 30, 60, 120].map(m => (
          <button key={m} onClick={() => onChange(m)} className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
            style={value === m ? { background: C.primary, color: C.bg } : { background: C.surface, color: C.muted }}>
            {m < 60 ? `${m}m` : `${m / 60}h`}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatDuration(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h && m) return `${h}h${m.toString().padStart(2, '0')}`
  if (h) return `${h}h`
  return `${m}min`
}

// ── ActionCard: memoized — re-renders only when this specific action changes ──
const ActionCard = memo(function ActionCard({ action, cat, owner, actionUrls, actionUnranked, isEditing, dateStr, onEdit, onDelete }: {
  action: Action
  cat?: { id: string; name: string; color: string }
  owner?: { id: string; name: string; color: string }
  actionUrls: { id: string; url: string }[]
  actionUnranked: { id: string; url: string; visible: boolean }[]
  isEditing: boolean
  dateStr: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-1.5"
      style={{ background: C.bg, border: `1px solid ${isEditing ? C.primary : C.border}` }}>
      <div className="flex items-start gap-2">
        {cat && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: cat.color }} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: C.text }}>{action.name}</span>
            {cat && <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium" style={{ color: cat.color, borderColor: cat.color + '40', backgroundColor: cat.color + '15' }}>{cat.name}</span>}
            {owner && <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex items-center gap-1" style={{ color: owner.color, borderColor: owner.color + '40', backgroundColor: owner.color + '15' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: owner.color }} />{owner.name}
            </span>}
            {action.time_spent != null && action.time_spent > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: C.surface, color: C.muted }}>⏱ {formatDuration(action.time_spent)}</span>}
          </div>
          <span className="text-xs" style={{ color: C.muted }}>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="text-xs px-2 py-1 rounded" style={{ color: isEditing ? C.light : C.dim }}
            onMouseEnter={e => (e.currentTarget.style.color = C.primary)} onMouseLeave={e => (e.currentTarget.style.color = isEditing ? C.light : C.dim)}>✎</button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded" style={{ color: C.dim }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {action.is_global
          ? <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: C.border, color: C.primary, borderColor: C.primary + '40' }}>Global</span>
          : <>
            {actionUrls.map(u => <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full border truncate max-w-60" style={{ background: C.surface, color: C.muted, borderColor: C.border }}>{u.url}</span>)}
            {actionUnranked.map(u => <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full border truncate max-w-60" style={{ background: C.surface, color: C.light, opacity: 0.7, borderColor: C.border }}><span className="text-[8px] mr-0.5">NR</span>{u.url}</span>)}
            {!actionUrls.length && !actionUnranked.length && <span className="text-[10px]" style={{ color: C.dim }}>Aucune URL</span>}
          </>}
      </div>
      {action.notes && <p className="text-[11px] italic" style={{ color: C.muted }}>{action.notes}</p>}
    </div>
  )
})

// ════════════════════════════════════════════════════════════════════════════
export function ActionsTab({ preselectedUrls }: { preselectedUrls?: string[] }) {
  const {
    actions, roadmap, categories, owners, unrankedUrls, loading,
    createOwner, deleteOwner,
    createAction, updateAction, deleteAction,
    createRoadmapAction, updateRoadmapAction, deleteRoadmapAction, validateRoadmapAction,
    importUnrankedUrls, toggleUnrankedVisibility, deleteUnrankedUrl,
  } = useActions()

  const [subTab, setSubTab] = useState<SubTab>('done')
  const [rankUrls, setRankUrls] = useState<{ id: string; url: string }[]>([])
  useEffect(() => { supabase.from('urls').select('id, url').order('url').then(({ data }) => setRankUrls(data ?? [])) }, [])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingType, setEditingType] = useState<'action' | 'roadmap'>('action')
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [isGlobal, setIsGlobal] = useState(false)
  const [selectedUrls, setSelectedUrls] = useState<string[]>([])
  const [selectedUnranked, setSelectedUnranked] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [timeSpent, setTimeSpent] = useState(0)
  const [priority, setPriority] = useState('medium')
  const [estimatedTime, setEstimatedTime] = useState(0)
  const [urlSearch, setUrlSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [filterCat, setFilterCat] = useState('all')
  const [filterOwner, setFilterOwner] = useState('all')
  const [showOwnerManager, setShowOwnerManager] = useState(false)
  const [newOwnerName, setNewOwnerName] = useState('')
  const [newOwnerColor, setNewOwnerColor] = useState('#317979')
  const [showUnrankedManager, setShowUnrankedManager] = useState(false)
  const [validatingId, setValidatingId] = useState<string | null>(null)
  const [validateDate, setValidateDate] = useState(new Date().toISOString().slice(0, 10))
  const [validateTime, setValidateTime] = useState(0)
  const [claudeAnalysis, setClaudeAnalysis] = useState<string | null>(null)
  const [claudeLoading, setClaudeLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (preselectedUrls && preselectedUrls.length > 0) {
      setSelectedUrls(preselectedUrls)
      setSubTab('done')
    }
  }, [preselectedUrls])

  const visibleUnranked = useMemo(() => unrankedUrls.filter(u => u.visible), [unrankedUrls])
  const allUrlOptions = useMemo<UrlOption[]>(() => [
    ...rankUrls.map(u => ({ ...u, unranked: false })),
    ...visibleUnranked.map(u => ({ ...u, unranked: true })),
  ], [rankUrls, visibleUnranked])

  const filteredUrlOptions = useMemo(() => {
    if (!urlSearch.trim()) return allUrlOptions
    const q = urlSearch.toLowerCase()
    return allUrlOptions.filter(u => u.url.toLowerCase().includes(q))
  }, [allUrlOptions, urlSearch])

  const filteredActions = useMemo(() => {
    let list = actions
    if (filterCat === 'global') list = list.filter(a => a.is_global)
    else if (filterCat !== 'all') list = list.filter(a => a.category_id === filterCat)
    if (filterOwner !== 'all') list = list.filter(a => a.owner_id === filterOwner)
    return list
  }, [actions, filterCat, filterOwner])

  const activeRoadmap = useMemo(() => roadmap.filter(r => r.status !== 'done'), [roadmap])
  const totalTimeSpent = useMemo(() => filteredActions.reduce((sum, a) => sum + (a.time_spent ?? 0), 0), [filteredActions])

  function resetForm() {
    setEditingId(null); setEditingType('action')
    setName(''); setDate(new Date().toISOString().slice(0, 10))
    setCategoryId(''); setOwnerId(''); setIsGlobal(false)
    setSelectedUrls([]); setSelectedUnranked([])
    setNotes(''); setTimeSpent(0); setPriority('medium'); setEstimatedTime(0); setUrlSearch('')
    setClaudeAnalysis(null)
  }

  function startEditingAction(action: Action) {
    setSubTab('done'); setEditingId(action.id); setEditingType('action')
    setName(action.name); setDate(action.date); setCategoryId(action.category_id ?? '')
    setOwnerId(action.owner_id ?? '')
    setIsGlobal(action.is_global); setSelectedUrls(action.url_ids); setSelectedUnranked(action.unranked_url_ids)
    setNotes(action.notes ?? ''); setTimeSpent(action.time_spent ?? 0); setUrlSearch('')
    formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEditingRoadmap(rm: RoadmapAction) {
    setSubTab('roadmap'); setEditingId(rm.id); setEditingType('roadmap')
    setName(rm.name); setDate(rm.planned_date ?? ''); setCategoryId(rm.category_id ?? '')
    setOwnerId(rm.owner_id ?? '')
    setIsGlobal(rm.is_global); setSelectedUrls(rm.url_ids); setSelectedUnranked(rm.unranked_url_ids)
    setNotes(rm.notes ?? ''); setPriority(rm.priority); setEstimatedTime(rm.estimated_time ?? 0); setUrlSearch('')
    formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    if (subTab === 'done') {
      if (!date) { setSaving(false); return }
      const payload = {
        name: name.trim(), date, is_global: isGlobal, category_id: categoryId || null,
        owner_id: ownerId || null,
        notes: notes.trim() || undefined, time_spent: timeSpent > 0 ? timeSpent : undefined,
        url_ids: isGlobal ? [] : selectedUrls, unranked_url_ids: isGlobal ? [] : selectedUnranked,
      }
      if (editingId && editingType === 'action') await updateAction(editingId, payload)
      else await createAction(payload)
    } else {
      const payload = {
        name: name.trim(), planned_date: date || undefined, is_global: isGlobal,
        category_id: categoryId || null, owner_id: ownerId || null,
        notes: notes.trim() || undefined,
        priority, estimated_time: estimatedTime > 0 ? estimatedTime : undefined,
        url_ids: isGlobal ? [] : selectedUrls, unranked_url_ids: isGlobal ? [] : selectedUnranked,
      }
      if (editingId && editingType === 'roadmap') await updateRoadmapAction(editingId, payload)
      else await createRoadmapAction(payload)
    }
    resetForm(); setSaving(false)
  }

  function toggleUrl(id: string, isUnranked: boolean) {
    if (isUnranked) setSelectedUnranked(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
    else setSelectedUrls(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split(/[\n\r]+/)
      const startIdx = lines[0]?.match(/^https?:\/\/|^\//) ? 0 : 1
      const imported = lines.slice(startIdx)
        .map(line => line.split(/[,;\t]/)[0].trim().replace(/^["']+|["']+$/g, ''))
        .filter(u => u && (u.startsWith('http') || u.startsWith('/')))
      importUnrankedUrls(imported)
    }
    reader.readAsText(file); e.target.value = ''
  }

  function isFutureDate(d: string) {
    return !!d && d > new Date().toISOString().slice(0, 10)
  }

  async function analyzeWithClaude() {
    if (!name.trim()) return
    setClaudeLoading(true); setClaudeAnalysis(null)
    const urlList = selectedUrls.map(id => rankUrls.find(u => u.id === id)?.url).filter(Boolean).join('\n')
    const catName = categories.find(c => c.id === categoryId)?.name ?? ''
    const ownerName = owners.find(o => o.id === ownerId)?.name ?? ''
    const prompt = `Tu es un expert SEO. Analyse cette action SEO et dis-moi si elle est pertinente, ce qu'on pourrait améliorer, et des éléments à ne pas oublier.

Action : "${name}"
Date : ${date || 'non définie'}
Catégorie : ${catName || 'non définie'}
Owner : ${ownerName || 'non défini'}
Globale : ${isGlobal ? 'oui' : 'non'}
${urlList ? `URLs concernées :\n${urlList}` : ''}
${notes ? `Notes : ${notes}` : ''}

Réponds de façon concise (5-8 lignes max), en français, directement sans introduction.`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      setClaudeAnalysis(data.content?.find((b: any) => b.type === 'text')?.text ?? 'Aucune réponse.')
    } catch {
      setClaudeAnalysis('Erreur lors de l\'analyse.')
    }
    setClaudeLoading(false)
  }

  function canValidate(rm: RoadmapAction) {
    const missing: string[] = []
    if (!rm.name.trim()) missing.push('Nom')
    if (!rm.category_id) missing.push('Catégorie')
    if (!rm.is_global && rm.url_ids.length === 0 && rm.unranked_url_ids.length === 0) missing.push('URLs')
    return { valid: missing.length === 0, missing }
  }

  async function handleValidate(id: string) {
    if (!validateDate) return
    setSaving(true)
    await validateRoadmapAction(id, validateDate, validateTime > 0 ? validateTime : undefined)
    setValidatingId(null); setValidateDate(new Date().toISOString().slice(0, 10)); setValidateTime(0)
    setSaving(false)
  }

  if (loading) return <SkeletonActions />

  return (
    <div className="flex gap-6" style={{ height: 'calc(100vh - 140px)' }}>

      {/* ── Form ── */}
      <div ref={formRef} className="w-96 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>
            {editingId ? (editingType === 'roadmap' ? 'Modifier (roadmap)' : 'Modifier') : (subTab === 'roadmap' ? 'Planifier une action' : 'Nouvelle action')}
          </h2>
          {editingId && <button onClick={resetForm} className="text-[10px]" style={{ color: C.dim }}>Annuler</button>}
        </div>

        {/* Nom */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: C.muted }}>Nom *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Refonte balises title"
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: C.muted }}>{subTab === 'roadmap' ? 'Date prévue' : 'Date *'}</label>
          <MiniCalendar value={date} onChange={setDate} />
        </div>

        {/* Catégorie */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: C.muted }}>Catégorie {subTab === 'roadmap' ? '*' : ''}</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none cursor-pointer appearance-none"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">— Aucune —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Owner */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs" style={{ color: C.muted }}>Owner</label>
            <button onClick={() => setShowOwnerManager(p => !p)} className="text-[9px]" style={{ color: C.primary }}>
              {showOwnerManager ? 'Fermer' : '+ Gérer'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {ownerId && (() => { const o = owners.find(o => o.id === ownerId); return o ? <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} /> : null })()}
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none cursor-pointer appearance-none"
              style={{ background: C.surface, border: `1px solid ${ownerId ? (owners.find(o => o.id === ownerId)?.color ?? C.border) : C.border}`, color: C.text }}>
              <option value="">— Aucun —</option>
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          {showOwnerManager && (
            <div className="rounded-lg p-2.5 flex flex-col gap-2 mt-1" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              {owners.length > 0 && (
                <div className="flex flex-col gap-1">
                  {owners.map(o => (
                    <div key={o.id} className="flex items-center gap-2 px-1.5 py-1 rounded group">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />
                      <span className="text-xs flex-1" style={{ color: '#a3c4c4' }}>{o.name}</span>
                      <button onClick={() => deleteOwner(o.id)} className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: C.dim }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input type="color" value={newOwnerColor} onChange={e => setNewOwnerColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 p-0 flex-shrink-0" style={{ background: 'transparent' }} />
                <input value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)}
                  placeholder="Nom de l'owner…"
                  onKeyDown={async e => { if (e.key === 'Enter' && newOwnerName.trim()) { await createOwner(newOwnerName.trim(), newOwnerColor); setNewOwnerName('') } }}
                  className="flex-1 text-xs px-2 py-1 rounded focus:outline-none"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
                <button onClick={async () => { if (newOwnerName.trim()) { await createOwner(newOwnerName.trim(), newOwnerColor); setNewOwnerName('') } }}
                  className="text-xs px-2 py-1 rounded" style={{ background: C.primary, color: C.bg }}>+</button>
              </div>
            </div>
          )}
        </div>

        {/* Roadmap-specific fields */}
        {subTab === 'roadmap' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: C.muted }}>Priorité</label>
              <div className="flex gap-1">
                {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-medium border ${priority === p ? PRIORITY_STYLES[p].bg + ' ' + PRIORITY_STYLES[p].text + ' ' + PRIORITY_STYLES[p].border : ''}`}
                    style={priority !== p ? { background: C.surface, color: C.dim, borderColor: C.border } : {}}>
                    {PRIORITY_STYLES[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: C.muted }}>Temps estimé</label>
              <TimeSpentInput value={estimatedTime} onChange={setEstimatedTime} />
            </div>
          </>
        )}

        {subTab === 'done' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: C.muted }}>Temps passé</label>
            <TimeSpentInput value={timeSpent} onChange={setTimeSpent} />
          </div>
        )}

        {/* Global toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input type="checkbox" checked={isGlobal} onChange={e => setIsGlobal(e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#317979]" style={{ background: C.border }} />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-transform" />
          </div>
          <span className="text-sm" style={{ color: C.muted }}>Action globale</span>
        </label>

        {/* URLs */}
        {!isGlobal && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs" style={{ color: C.muted }}>URLs ({selectedUrls.length + selectedUnranked.length}){subTab === 'roadmap' ? ' *' : ''}</label>
              <button onClick={() => setShowUnrankedManager(!showUnrankedManager)} className="text-[9px]" style={{ color: C.primary }}>
                {showUnrankedManager ? 'Masquer' : '+ Import'}
              </button>
            </div>
            {showUnrankedManager && (
              <div className="rounded-lg p-2 flex flex-col gap-2" style={{ background: C.surface }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 rounded text-[10px]" style={{ background: C.border, color: '#a3c4c4' }}>📄 Importer CSV</button>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleCsvImport} className="hidden" />
                  <span className="text-[9px]" style={{ color: C.dim }}>URLs en 1ère colonne</span>
                </div>
                {unrankedUrls.length > 0 && (
                  <div className="max-h-24 overflow-y-auto flex flex-col gap-0.5">
                    {unrankedUrls.map(u => (
                      <div key={u.id} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded">
                        <span className="text-[9px]" style={{ color: '#a3f1eb', opacity: 0.6 }}>●</span>
                        <span className="text-[10px] truncate flex-1" style={{ color: u.visible ? C.muted : C.dim, textDecoration: u.visible ? 'none' : 'line-through' }}>{u.url}</span>
                        <button onClick={() => toggleUnrankedVisibility(u.id, !u.visible)} className="text-[8px]" style={{ color: C.dim }}>{u.visible ? '👁' : '👁‍🗨'}</button>
                        <button onClick={() => deleteUnrankedUrl(u.id)} className="text-[8px]" style={{ color: C.dim }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <input value={urlSearch} onChange={e => setUrlSearch(e.target.value)} placeholder="Filtrer…"
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
            <div className="max-h-28 overflow-y-auto flex flex-col gap-0.5 rounded-lg p-1" style={{ background: C.surface }}>
              {filteredUrlOptions.length === 0
                ? <p className="text-xs text-center py-3" style={{ color: C.dim }}>Aucune URL</p>
                : filteredUrlOptions.map(u => {
                  const isChecked = u.unranked ? selectedUnranked.includes(u.id) : selectedUrls.includes(u.id)
                  return (
                    <label key={`${u.unranked ? 'u' : 't'}-${u.id}`}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs"
                      style={isChecked ? { background: C.border, color: C.light } : { color: C.muted }}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleUrl(u.id, u.unranked)}
                        className="rounded focus:ring-0" style={{ accentColor: C.primary }} />
                      {u.unranked && <span className="text-[8px] flex-shrink-0" style={{ color: '#a3f1eb', opacity: 0.6 }}>NR</span>}
                      <span className="truncate">{u.url}</span>
                    </label>
                  )
                })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: C.muted }}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Détails…"
            className="rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={analyzeWithClaude} disabled={claudeLoading || !name.trim()} title="Analyser avec Claude"
              className="flex-shrink-0 px-3 py-2 rounded-lg text-sm border transition-colors"
              style={claudeLoading || !name.trim()
                ? { border: `1px solid ${C.border}`, color: C.dim, cursor: 'not-allowed' }
                : { border: `1px solid ${C.primary}`, color: C.primary, background: 'transparent' }}>
              {claudeLoading ? '…' : '✦'}
            </button>
            <button onClick={handleSubmit} disabled={saving || !name.trim() || (subTab === 'done' && !date)}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              style={saving || !name.trim() || (subTab === 'done' && !date)
                ? { background: C.border, color: C.dim, cursor: 'not-allowed' }
                : editingId ? { background: '#2a6060', color: C.text } : { background: C.primary, color: C.bg }}>
              {saving ? '…' : editingId ? 'Mettre à jour' : subTab === 'roadmap' ? 'Planifier' : isFutureDate(date) ? 'Ajouter à la Roadmap' : 'Ajouter'}
            </button>
          </div>
          {claudeAnalysis && (
            <div className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: C.primary }}>Analyse Claude</span>
                <button onClick={() => setClaudeAnalysis(null)} className="text-[9px]" style={{ color: C.muted }}>✕</button>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#a3c4c4' }}>{claudeAnalysis}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg p-0.5" style={{ background: C.surface }}>
            <button onClick={() => { setSubTab('done'); resetForm() }} className="px-4 py-1.5 rounded-md text-xs transition-colors"
              style={subTab === 'done' ? { background: C.primary, color: C.bg, fontWeight: 600 } : { color: C.muted }}>
              Réalisées ({filteredActions.length})
            </button>
            <button onClick={() => { setSubTab('roadmap'); resetForm() }} className="px-4 py-1.5 rounded-md text-xs transition-colors"
              style={subTab === 'roadmap' ? { background: C.primary, color: C.bg, fontWeight: 600 } : { color: C.muted }}>
              Roadmap ({activeRoadmap.length})
            </button>
          </div>
          {subTab === 'done' && totalTimeSpent > 0 && <span className="text-xs" style={{ color: C.muted }}>· {formatDuration(totalTimeSpent)}</span>}
          <div className="ml-auto flex gap-1.5">
            {subTab === 'done' && (
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer appearance-none"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: '#a3c4c4' }}>
                <option value="all">Toutes catégories</option>
                <option value="global">Globales</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {owners.length > 0 && (
              <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
                className="rounded-lg px-2 py-1 text-xs focus:outline-none cursor-pointer appearance-none"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: '#a3c4c4' }}>
                <option value="all">Tous owners</option>
                {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Réalisées */}
        {subTab === 'done' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {filteredActions.length === 0
              ? <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: C.dim }}><p className="text-sm">Aucune action</p></div>
              : filteredActions.map(action => {
                const cat = categories.find(c => c.id === action.category_id)
                const owner = owners.find(o => o.id === action.owner_id)
                const actionUrls = rankUrls.filter(u => action.url_ids.includes(u.id))
                const actionUnranked = unrankedUrls.filter(u => action.unranked_url_ids.includes(u.id))
                const isEditing = editingId === action.id && editingType === 'action'
                let dateStr = action.date; try { dateStr = format(parseISO(action.date), 'd MMM yyyy', { locale: fr }) } catch {}
                return (
                  <ActionCard key={action.id}
                    action={action} cat={cat} owner={owner}
                    actionUrls={actionUrls} actionUnranked={actionUnranked}
                    isEditing={isEditing} dateStr={dateStr}
                    onEdit={() => startEditingAction(action)}
                    onDelete={() => { deleteAction(action.id); if (isEditing) resetForm() }}
                  />
                )
              })}
          </div>
        )}

        {/* Roadmap */}
        {subTab === 'roadmap' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {activeRoadmap.length === 0
              ? <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: C.dim }}>
                <p className="text-sm">Aucune action planifiée</p>
                <p className="text-xs">Utilisez le formulaire pour planifier des actions.</p>
              </div>
              : activeRoadmap.map(rm => {
                const cat = categories.find(c => c.id === rm.category_id)
                const owner = owners.find(o => o.id === rm.owner_id)
                const rmUrls = rankUrls.filter(u => rm.url_ids.includes(u.id))
                const rmUnranked = unrankedUrls.filter(u => rm.unranked_url_ids.includes(u.id))
                const isEditing = editingId === rm.id && editingType === 'roadmap'
                const { valid, missing } = canValidate(rm)
                const isValidating = validatingId === rm.id
                const ps = PRIORITY_STYLES[rm.priority]
                let dateStr = rm.planned_date
                if (dateStr) try { dateStr = format(parseISO(dateStr), 'd MMM yyyy', { locale: fr }) } catch {}
                return (
                  <div key={rm.id} className="rounded-xl px-4 py-3 flex flex-col gap-2"
                    style={{ background: C.bg, border: `1px solid ${isEditing ? C.primary : C.border}` }}>
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                        {cat && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />}
                        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${ps.bg} ${ps.text} ${ps.border}`}>{ps.label}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: C.text }}>{rm.name}</span>
                          {cat && <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium" style={{ color: cat.color, borderColor: cat.color + '40', backgroundColor: cat.color + '15' }}>{cat.name}</span>}
                          {owner && <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex items-center gap-1" style={{ color: owner.color, borderColor: owner.color + '40', backgroundColor: owner.color + '15' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: owner.color }} />{owner.name}
                          </span>}
                          {rm.estimated_time != null && rm.estimated_time > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: C.surface, color: C.muted }}>≈ {formatDuration(rm.estimated_time)}</span>}
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={rm.status === 'in_progress' ? { background: '#1a3060', color: '#60a0f0' } : { background: C.surface, color: C.muted }}>
                            {rm.status === 'in_progress' ? 'En cours' : 'Backlog'}
                          </span>
                        </div>
                        {dateStr && <span className="text-xs" style={{ color: C.muted }}>Prévu : {dateStr}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEditingRoadmap(rm)} className="text-xs px-2 py-1 rounded" style={{ color: isEditing ? C.light : C.dim }}
                          onMouseEnter={e => (e.currentTarget.style.color = C.primary)} onMouseLeave={e => (e.currentTarget.style.color = isEditing ? C.light : C.dim)}>✎</button>
                        <button onClick={() => { deleteRoadmapAction(rm.id); if (isEditing) resetForm() }} className="text-xs px-2 py-1 rounded" style={{ color: C.dim }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rm.is_global
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: C.border, color: C.primary, borderColor: C.primary + '40' }}>Global</span>
                        : <>
                          {rmUrls.map(u => <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full border truncate max-w-60" style={{ background: C.surface, color: C.muted, borderColor: C.border }}>{u.url}</span>)}
                          {rmUnranked.map(u => <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full border truncate max-w-60" style={{ background: C.surface, color: C.light, opacity: 0.7, borderColor: C.border }}><span className="text-[8px] mr-0.5">NR</span>{u.url}</span>)}
                          {!rmUrls.length && !rmUnranked.length && <span className="text-[10px]" style={{ color: '#ef4444', opacity: 0.6 }}>⚠ Aucune URL</span>}
                        </>}
                    </div>
                    {rm.notes && <p className="text-[11px] italic" style={{ color: C.muted }}>{rm.notes}</p>}
                    {!isValidating ? (
                      <div className="flex items-center gap-2 pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
                        {valid ? (
                          <button onClick={() => { setValidatingId(rm.id); setValidateDate(new Date().toISOString().slice(0, 10)); setValidateTime(rm.estimated_time ?? 0) }}
                            className="px-3 py-1 rounded text-xs font-medium"
                            style={{ background: '#0d2a1a', color: '#4ade80', border: '1px solid #166534' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#14532d')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#0d2a1a')}>
                            ✓ Valider comme réalisée
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px]" style={{ color: C.dim }}>Manque :</span>
                            {missing.map(m => <span key={m} className="text-[9px] px-1.5 py-0.5 rounded border" style={{ background: '#2a0d0d', color: '#f87171', borderColor: '#7f1d1d' }}>{m}</span>)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 pt-2 rounded-b-xl -mx-4 -mb-3 px-4 pb-3" style={{ borderTop: '1px solid #1a4a2a', background: '#071a0f' }}>
                        <span className="text-[10px] font-semibold" style={{ color: '#4ade80' }}>Valider cette action</span>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px]" style={{ color: C.muted }}>Date de réalisation *</label>
                          <input type="date" value={validateDate} onChange={e => setValidateDate(e.target.value)}
                            className="rounded px-2 py-1 text-xs focus:outline-none w-40"
                            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px]" style={{ color: C.muted }}>Temps réel passé</label>
                          <TimeSpentInput value={validateTime} onChange={setValidateTime} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleValidate(rm.id)} disabled={!validateDate || saving}
                            className="px-3 py-1.5 rounded text-xs font-medium"
                            style={!validateDate || saving ? { background: C.border, color: C.dim, cursor: 'not-allowed' } : { background: '#166534', color: C.text }}>
                            {saving ? '…' : 'Confirmer'}
                          </button>
                          <button onClick={() => setValidatingId(null)} className="text-xs" style={{ color: C.muted }}
                            onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>Annuler</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}