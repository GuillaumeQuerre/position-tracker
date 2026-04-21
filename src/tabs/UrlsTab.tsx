import { useState } from 'react'
import { useUrlsData } from '../hooks/useUrlsData'
import { MultiTagSelector } from '../components/MultiTagSelector'
import { RegexTagger } from '../components/RegexTagger'
import { PositionBadge } from '../components/PositionBadge'
import { SkeletonTable } from '../components/SkeletonLoader'

const C = { bg: '#071212', border: '#1a3535', surface: '#0d1f1f', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

export function UrlsTab() {
  const { urls, categories, loading, addTag, removeTag, createAndAddTag, bulkAddTag, applyRegexTag, deleteCategory } = useUrlsData()
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [bulkCatId, setBulkCatId] = useState('')
  const [showRegex, setShowRegex] = useState(false)
  const [showCatManager, setShowCatManager] = useState(false)

  const filtered = urls.filter(u => u.url.toLowerCase().includes(search.toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(u => selected.includes(u.id))

  function toggleAll() { setSelected(allSelected ? [] : filtered.map(u => u.id)) }
  function toggleOne(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]) }

  async function handleBulkTag() {
    if (!bulkCatId || selected.length === 0) return
    await bulkAddTag(selected, bulkCatId)
    setSelected([]); setBulkCatId('')
  }

  async function handleDeleteCategory(catId: string) {
    const cat = categories.find(c => c.id === catId); if (!cat) return
    const count = urls.filter(u => u.tags.some(t => t.id === catId)).length
    const msg = count > 0 ? `Supprimer "${cat.name}" ? ${count} URL${count>1?'s':''} seront détaggée${count>1?'s':''}.` : `Supprimer "${cat.name}" ?`
    if (confirm(msg)) await deleteCategory(catId)
  }

  if (loading) return <SkeletonTable rows={8} />

  return (
    <div className="space-y-3">

      {/* Barre du haut */}
      <div className="flex items-center gap-2">
        <input type="text" placeholder="Rechercher une URL…" value={search} onChange={e => setSearch(e.target.value)}
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
      </div>

      {showRegex && <RegexTagger categories={categories} onApply={applyRegexTag} placeholder="Ex: /produit|millesime|odyssey" />}

      {showCatManager && (
        <div className="rounded-xl px-4 py-3" style={{background: C.bg, border: `1px solid ${C.border}`}}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold" style={{color: C.primary}}>Catégories URLs</span>
            <span className="text-[10px]" style={{color: C.dim}}>{categories.length} catégorie{categories.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.length === 0 ? (
              <p className="text-xs" style={{color: C.dim}}>Aucune catégorie créée</p>
            ) : categories.map(cat => {
              const count = urls.filter(u => u.tags.some(t => t.id === cat.id)).length
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
            {selected.length} sélectionnée{selected.length > 1 ? 's' : ''}
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
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>URL</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Position</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider w-16" style={{color: C.primary}}>Mots-clés</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Liste</th>
              <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{color: C.primary}}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-sm" style={{color: C.dim}}>Aucune URL trouvée</td></tr>
            )}
            {filtered.map(u => {
              const isSelected = selected.includes(u.id)
              return (
                <tr key={u.id}
                  style={{borderBottom: `1px solid ${C.border}40`, background: isSelected ? `${C.primary}12` : 'transparent', transition: 'background 0.1s'}}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surface }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? `${C.primary}12` : 'transparent' }}>
                  <td className="py-3 px-3">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(u.id)} style={{accentColor: C.primary}} />
                  </td>
                  <td className="py-3 px-3 text-xs max-w-xs">
                    <a href={u.url} target="_blank" rel="noopener noreferrer"
                      className="truncate block transition-colors" style={{color: C.muted}}
                      onMouseEnter={e => (e.currentTarget.style.color=C.light)} onMouseLeave={e => (e.currentTarget.style.color=C.muted)}>
                      {u.url}
                    </a>
                  </td>
                  <td className="py-3 px-3"><PositionBadge position={u.latestPosition} /></td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-sm font-mono" style={{color: C.text}}>{u.keywordCount}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {u.keywords.slice(0, 4).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 text-xs rounded" style={{background: C.surface, color: C.muted}}>{kw.keyword}</span>
                      ))}
                      {u.keywords.length > 4 && <span className="px-1.5 py-0.5 text-xs" style={{color: C.dim}}>+{u.keywords.length - 4}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <MultiTagSelector tags={u.tags} categories={categories}
                      onAdd={(catId) => addTag(u.id, catId)}
                      onRemove={(catId) => removeTag(u.id, catId)}
                      onCreate={(name, color) => createAndAddTag(u.id, name, color)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-right" style={{color: C.dim}}>{filtered.length} URL{filtered.length > 1 ? 's' : ''}</p>
    </div>
  )
}