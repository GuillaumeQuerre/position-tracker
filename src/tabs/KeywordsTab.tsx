import { useState, useMemo, useRef, useEffect } from 'react'
import { useKeywordsData } from '../hooks/useKeywordsData'
import { MultiTagSelector } from '../components/MultiTagSelector'
import { RegexTagger } from '../components/RegexTagger'
import { PositionBadge } from '../components/PositionBadge'
import { SkeletonTable } from '../components/SkeletonLoader'

const C = { bg: '#071212', border: '#1a3535', surface: '#0d1f1f', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }
const PAGE_SIZE = 150

export function KeywordsTab() {
  const { keywords, categories, cannibalisations, loading, addTag, removeTag, createAndAddTag, bulkAddTag, applyRegexTag, deleteCategory } = useKeywordsData()
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [bulkCatId, setBulkCatId] = useState('')
  const [showRegex, setShowRegex] = useState(false)
  const [showCatManager, setShowCatManager] = useState(false)
  const [showCannibalisations, setShowCannibalisations] = useState(false)
  const [filterCannibalised, setFilterCannibalised] = useState(false)
  const [page, setPage] = useState(1)

  // Debounce search input — 150ms avoids filtering on every keystroke
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => { setDebouncedSearch(value); setPage(1) }, 150)
  }
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }, [])

  const filtered = useMemo(() => keywords.filter(kw => {
    const matchSearch = !debouncedSearch || kw.keyword.toLowerCase().includes(debouncedSearch.toLowerCase())
    const matchCannibal = !filterCannibalised || kw.cannibalised
    return matchSearch && matchCannibal
  }), [keywords, debouncedSearch, filterCannibalised])
  const allSelected = filtered.length > 0 && filtered.every(k => selected.includes(k.id))
  const cannCount = keywords.filter(k => k.cannibalised).length

  function toggleAll() { setSelected(allSelected ? [] : filtered.map(k => k.id)) }
  function toggleOne(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]) }

  async function handleBulkTag() {
    if (!bulkCatId || selected.length === 0) return
    await bulkAddTag(selected, bulkCatId)
    setSelected([]); setBulkCatId('')
  }

  async function handleDeleteCategory(catId: string) {
    const cat = categories.find(c => c.id === catId); if (!cat) return
    const count = keywords.filter(k => k.tags.some(t => t.id === catId)).length
    const msg = count > 0 ? `Supprimer "${cat.name}" ? ${count} mot${count > 1 ? 's' : ''}-clé${count > 1 ? 's' : ''} seront détaggés.` : `Supprimer "${cat.name}" ?`
    if (confirm(msg)) await deleteCategory(catId)
  }

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-3">

      {/* Barre du haut */}
      <div className="flex items-center gap-2">
        <input type="text" placeholder="Rechercher un mot-clé…" value={search} onChange={e => handleSearchChange(e.target.value)}
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
          style={{background: C.surface, border: `1px solid ${C.border}`, color: C.text}} />
        <button onClick={() => setShowRegex(r => !r)}
          className="px-3 py-2 rounded-lg text-xs font-medium border transition-all"
          style={showRegex ? {background: C.primary, borderColor: C.primary, color: C.bg} : {background: C.surface, borderColor: C.border, color: C.muted}}>
          /{'{'}regex{'}'}
        </button>
        <button onClick={() => setShowCatManager(s => !s)}
          className="px-3 py-2 rounded-lg text-xs font-medium border transition-all"
          style={showCatManager ? {background: C.primary, borderColor: C.primary, color: C.bg} : {background: C.surface, borderColor: C.border, color: C.muted}}>
          Catégories
        </button>
        {cannCount > 0 && (
          <button onClick={() => { setFilterCannibalised(f => !f); setShowCannibalisations(false) }}
            className="px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5"
            style={filterCannibalised ? {background: '#7f1d1d', borderColor: '#ef4444', color: '#fca5a5'} : {background: C.surface, borderColor: '#7f1d1d', color: '#f87171'}}>
            ⚠ {cannCount} cannibalisés
          </button>
        )}
      </div>

      {showRegex && <RegexTagger categories={categories} onApply={applyRegexTag} placeholder="Ex: running|trail|marathon" />}

      {/* Cannibalisation panel */}
      {cannCount > 0 && (
        <div className="rounded-xl overflow-hidden" style={{border: `1px solid #7f1d1d`}}>
          <button
            onClick={() => setShowCannibalisations(s => !s)}
            className="w-full flex items-center justify-between px-4 py-2.5"
            style={{background: '#2a0d0d'}}>
            <div className="flex items-center gap-2">
              <span style={{color: '#f87171', fontSize: 12}}>⚠</span>
              <span className="text-xs font-semibold" style={{color: '#fca5a5'}}>
                Cannibalisations détectées — {cannibalisations.length} entrée{cannibalisations.length > 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-[10px]" style={{color: '#f87171'}}>{showCannibalisations ? '▲' : '▼'}</span>
          </button>
          {showCannibalisations && (
            <div className="overflow-x-auto" style={{background: '#1a0505'}}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{borderBottom: `1px solid #7f1d1d`}}>
                    <th className="py-2 px-3 text-left font-semibold" style={{color: '#f87171'}}>Mot-clé</th>
                    <th className="py-2 px-3 text-left font-semibold" style={{color: '#f87171'}}>Ancienne URL</th>
                    <th className="py-2 px-3 text-left font-semibold" style={{color: '#f87171'}}>Nouvelle URL</th>
                    <th className="py-2 px-3 text-left font-semibold" style={{color: '#f87171'}}>Détecté le</th>
                  </tr>
                </thead>
                <tbody>
                  {cannibalisations.map(c => (
                    <tr key={c.id} style={{borderBottom: `1px solid #7f1d1d40`}}>
                      <td className="py-2 px-3 font-medium" style={{color: '#fca5a5'}}>{c.keyword}</td>
                      <td className="py-2 px-3 truncate max-w-xs" style={{color: '#f87171', opacity: 0.7}}>{c.old_url}</td>
                      <td className="py-2 px-3 truncate max-w-xs" style={{color: '#fca5a5'}}>{c.new_url}</td>
                      <td className="py-2 px-3 font-mono" style={{color: '#f87171', opacity: 0.7}}>{c.detected_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCatManager && (
        <div className="rounded-xl px-4 py-3" style={{background: C.bg, border: `1px solid ${C.border}`}}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold" style={{color: C.primary}}>Catégories mots-clés</span>
            <span className="text-[10px]" style={{color: C.dim}}>{categories.length} catégorie{categories.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.length === 0 ? (
              <p className="text-xs" style={{color: C.dim}}>Aucune catégorie créée</p>
            ) : categories.map(cat => {
              const count = keywords.filter(k => k.tags.some(t => t.id === cat.id)).length
              return (
                <div key={cat.id} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 group" style={{background: C.surface}}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs" style={{color: C.text}}>{cat.name}</span>
                  <span className="text-[9px] font-mono" style={{color: C.dim}}>{count}</span>
                  <button onClick={() => handleDeleteCategory(cat.id)}
                    className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                    style={{color: C.dim}}
                    onMouseEnter={e => (e.currentTarget.style.color='#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color=C.dim)}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{background: C.bg, border: `1px solid ${C.primary}`}}>
          <span className="text-xs flex-shrink-0" style={{color: C.light}}>
            {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
          </span>
          <select value={bulkCatId} onChange={e => setBulkCatId(e.target.value)}
            className="flex-1 rounded-md px-2 py-1 text-xs focus:outline-none appearance-none cursor-pointer"
            style={{background: C.surface, border: `1px solid ${C.border}`, color: C.text}}>
            <option value="">— Choisir un tag —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handleBulkTag} disabled={!bulkCatId}
            className="px-3 py-1 text-xs rounded-md transition-colors"
            style={bulkCatId ? {background: C.primary, color: C.bg} : {background: C.surface, color: C.dim, cursor:'not-allowed'}}>
            Appliquer
          </button>
          <button onClick={() => setSelected([])} className="text-xs transition-colors" style={{color: C.muted}}
            onMouseEnter={e => (e.currentTarget.style.color=C.light)} onMouseLeave={e => (e.currentTarget.style.color=C.muted)}>Annuler</button>
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-xl overflow-hidden" style={{border: `1px solid ${C.border}`}}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{borderBottom: `1px solid ${C.border}`, background: C.bg}}>
              <th className="py-3 px-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{accentColor: C.primary}} />
              </th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Mot-clé</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Position</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>URL</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-sm" style={{color: C.dim}}>Aucun mot-clé trouvé</td></tr>
            )}
            {filtered.slice(0, page * PAGE_SIZE).map(kw => (
              <tr key={kw.id} style={{
                borderBottom: `1px solid ${C.border}40`,
                background: kw.cannibalised
                  ? (selected.includes(kw.id) ? '#3a0d0d' : '#1a0505')
                  : (selected.includes(kw.id) ? `${C.primary}12` : 'transparent'),
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!selected.includes(kw.id)) e.currentTarget.style.background = kw.cannibalised ? '#2a0808' : C.surface }}
              onMouseLeave={e => { e.currentTarget.style.background = kw.cannibalised ? (selected.includes(kw.id) ? '#3a0d0d' : '#1a0505') : (selected.includes(kw.id) ? `${C.primary}12` : 'transparent') }}>
                <td className="py-3 px-3">
                  <input type="checkbox" checked={selected.includes(kw.id)} onChange={() => toggleOne(kw.id)} style={{accentColor: C.primary}} />
                </td>
                <td className="py-3 px-3 font-medium">
                  <div className="flex items-center gap-2">
                    <span style={{color: C.text}}>{kw.keyword}</span>
                    {kw.cannibalised && (
                      <span title="Cannibalisation détectée" className="text-[9px] px-1.5 py-0.5 rounded border"
                        style={{color: '#f87171', borderColor: '#7f1d1d', background: '#2a0d0d'}}>⚠ cannib.</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3"><PositionBadge position={kw.latestPosition} /></td>
                <td className="py-3 px-3 text-xs truncate max-w-xs" style={{color: kw.cannibalised ? '#f87171' : C.muted}}>{kw.url ?? '—'}</td>
                <td className="py-3 px-3">
                  <MultiTagSelector tags={kw.tags} categories={categories}
                    onAdd={(catId) => addTag(kw.id, catId)}
                    onRemove={(catId) => removeTag(kw.id, catId)}
                    onCreate={(name, color) => createAndAddTag(kw.id, name, color)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > page * PAGE_SIZE && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full py-2.5 text-xs transition-colors"
            style={{ background: C.surface, color: C.muted, borderTop: `1px solid ${C.border}` }}
            onMouseEnter={e => (e.currentTarget.style.color = C.light)}
            onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
            Afficher {Math.min(PAGE_SIZE, filtered.length - page * PAGE_SIZE)} de plus
            · {filtered.length - page * PAGE_SIZE} restants
          </button>
        )}
      </div>

      <p className="text-xs text-right" style={{color: C.dim}}>
        {filtered.length} mot{filtered.length > 1 ? 's' : ''}-clé{filtered.length > 1 ? 's' : ''}
        {filterCannibalised && ` · filtre cannibalisés actif`}
      </p>
    </div>
  )
}