import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

const C = { bg: '#071212', border: '#1a3535', surface: '#0d1f1f', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

interface Project { id: string; name: string; description: string | null }

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001'

export function ProjectSelector() {
  const { projectId, setProjectId } = useAppStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [showMenu, setShowMenu] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('projects').select('id, name, description').order('created_at')
    const list = data ?? []
    // Ensure default project always exists in UI
    if (!list.find(p => p.id === DEFAULT_PROJECT_ID)) {
      list.unshift({ id: DEFAULT_PROJECT_ID, name: 'Projet principal', description: null })
    }
    setProjects(list)
    // Set default project if none selected
    if (!projectId) setProjectId(list[0]?.id ?? DEFAULT_PROJECT_ID)
  }, [projectId, setProjectId])

  useEffect(() => { load() }, [load])

  const currentProject = projects.find(p => p.id === projectId) ?? projects[0]

  async function createProject() {
    if (!newName.trim()) return
    const { data } = await supabase.from('projects')
      .insert({ name: newName.trim(), description: newDesc.trim() || null })
      .select('id').single()
    if (data) { setProjectId(data.id); setShowCreate(false); setNewName(''); setNewDesc('') }
    await load()
  }

  async function renameProject(id: string, name: string) {
    if (!name.trim()) return
    await supabase.from('projects').update({ name: name.trim() }).eq('id', id)
    setEditingId(null)
    await load()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(s => !s)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
        <span style={{ color: C.primary }}>◈</span>
        <span className="max-w-32 truncate font-medium">{currentProject?.name ?? '…'}</span>
        <span style={{ color: C.muted, fontSize: 8 }}>▼</span>
      </button>

      {showMenu && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-2xl min-w-52"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}>

            <div className="px-3 py-2 border-b" style={{ borderColor: C.border }}>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.primary }}>Projets</p>
            </div>

            <div className="py-1 max-h-64 overflow-y-auto">
              {projects.map(p => (
                <div key={p.id} className="flex items-center gap-1 px-2 py-1.5 mx-1 rounded-lg group"
                  style={{ background: p.id === projectId ? `${C.primary}18` : 'transparent' }}
                  onMouseEnter={e => { if (p.id !== projectId) e.currentTarget.style.background = C.surface }}
                  onMouseLeave={e => { e.currentTarget.style.background = p.id === projectId ? `${C.primary}18` : 'transparent' }}>

                  {editingId === p.id ? (
                    <form onSubmit={e => { e.preventDefault(); renameProject(p.id, editName) }} className="flex-1 flex gap-1">
                      <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                        className="flex-1 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                        style={{ background: C.surface, border: `1px solid ${C.primary}`, color: C.text }} />
                      <button type="submit" className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.primary, color: C.bg }}>OK</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: C.muted }}>✕</button>
                    </form>
                  ) : (
                    <>
                      <button className="flex-1 text-left" onClick={() => { setProjectId(p.id); setShowMenu(false) }}>
                        <span className="text-xs" style={{ color: p.id === projectId ? C.light : C.text }}>{p.name}</span>
                        {p.description && <span className="block text-[9px] truncate" style={{ color: C.muted }}>{p.description}</span>}
                      </button>
                      {p.id !== DEFAULT_PROJECT_ID && (
                        <button onClick={() => { setEditingId(p.id); setEditName(p.name) }}
                          className="opacity-0 group-hover:opacity-100 text-[9px] px-1 py-0.5 rounded transition-opacity"
                          style={{ color: C.muted }}>✎</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t px-2 py-2" style={{ borderColor: C.border }}>
              {showCreate ? (
                <div className="flex flex-col gap-1.5">
                  <input autoFocus placeholder="Nom du projet" value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProject()}
                    className="rounded px-2 py-1 text-xs focus:outline-none"
                    style={{ background: C.surface, border: `1px solid ${C.primary}`, color: C.text }} />
                  <input placeholder="Description (optionnel)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    className="rounded px-2 py-1 text-xs focus:outline-none"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }} />
                  <div className="flex gap-1">
                    <button onClick={createProject} className="flex-1 rounded py-1 text-xs font-medium"
                      style={{ background: C.primary, color: C.bg }}>Créer</button>
                    <button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}
                      className="rounded px-2 py-1 text-xs" style={{ color: C.muted }}>Annuler</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCreate(true)}
                  className="w-full text-left rounded px-2 py-1 text-xs transition-colors"
                  style={{ color: C.muted }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.light)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                  + Nouveau projet
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}