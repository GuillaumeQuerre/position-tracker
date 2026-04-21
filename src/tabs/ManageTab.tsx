// tabs/ManageTab.tsx
// Gestion compte + membres projets

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { AuthUser } from '../hooks/useAuth'

const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

type Role = 'owner' | 'editor' | 'reader'
const ROLE_LABELS: Record<Role, string> = { owner: 'Propriétaire', editor: 'Éditeur', reader: 'Lecteur' }
const ROLE_COLORS: Record<Role, string> = { owner: '#a3f1eb', editor: '#317979', reader: '#4a7a7a' }

interface Member { id: string; user_email: string; role: Role; invited_by: string | null; created_at: string }
interface Project { id: string; name: string; owner_email: string | null }

// ── Section wrapper ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

// ── Project Members ──────────────────────────────────────────────
function ProjectMembers({ project, currentUser, userRole }: { project: Project; currentUser: AuthUser; userRole: Role | null }) {
  const [members, setMembers]   = useState<Member[]>([])
  const [loading, setLoading]   = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole]   = useState<'editor' | 'reader'>('editor')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const canManage = userRole === 'owner'

  useEffect(() => {
    setLoading(true)
    supabase.from('project_members').select('*').eq('project_id', project.id).order('created_at')
      .then(({ data }) => { setMembers(data ?? []); setLoading(false) })
  }, [project.id])

  async function addMember() {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('project_members').insert({
      project_id: project.id, user_email: email, role: newRole, invited_by: currentUser.email,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setMembers(prev => [...prev, { id: crypto.randomUUID(), user_email: email, role: newRole, invited_by: currentUser.email, created_at: new Date().toISOString() }])
    setNewEmail(''); setSaving(false)
  }

  async function removeMember(id: string) {
    await supabase.from('project_members').delete().eq('id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  async function changeRole(id: string, role: Role) {
    await supabase.from('project_members').update({ role }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m))
  }

  return (
    <div>
      {/* Owner */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Propriétaire</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: `${C.primary}18`, borderRadius: 8, border: `1px solid ${C.primary}40`, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: C.light, fontWeight: 600 }}>{project.owner_email ?? '—'}</span>
        <span style={{ fontSize: 10, background: `${C.primary}30`, color: C.primary, borderRadius: 4, padding: '1px 6px', marginLeft: 'auto' }}>propriétaire</span>
      </div>

      {/* Members */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Membres ({members.length})
      </div>
      {loading ? <div style={{ fontSize: 12, color: C.muted }}>Chargement…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {members.length === 0 && <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>Aucun membre invité</div>}
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: C.text }}>{m.user_email}</div>
                {m.invited_by && <div style={{ fontSize: 10, color: C.dim }}>Invité par {m.invited_by}</div>}
              </div>
              {canManage ? (
                <select value={m.role} onChange={e => changeRole(m.id, e.target.value as Role)}
                  style={{ fontSize: 11, padding: '3px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: ROLE_COLORS[m.role], cursor: 'pointer' }}>
                  <option value="editor">Éditeur</option>
                  <option value="reader">Lecteur</option>
                </select>
              ) : (
                <span style={{ fontSize: 11, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
              )}
              {canManage && (
                <button onClick={() => removeMember(m.id)}
                  style={{ fontSize: 11, color: C.dim, background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite */}
      {canManage && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Inviter un utilisateur</div>
          {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              placeholder="email@exemple.com"
              style={{ flex: 1, padding: '8px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }} />
            <select value={newRole} onChange={e => setNewRole(e.target.value as 'editor' | 'reader')}
              style={{ padding: '8px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, cursor: 'pointer' }}>
              <option value="editor">Éditeur</option>
              <option value="reader">Lecteur</option>
            </select>
            <button onClick={addMember} disabled={saving || !newEmail.includes('@')}
              style={{ padding: '8px 16px', background: saving ? C.dim : C.primary, color: C.bg, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? '…' : 'Inviter'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>L'utilisateur doit avoir un compte pour accéder au projet.</div>
        </>
      )}
    </div>
  )
}

// ── Account form ─────────────────────────────────────────────────
function AccountForm({ user, onLogout, updateDisplayName }: { user: AuthUser; onLogout: () => void; updateDisplayName: (n: string) => Promise<void> }) {
  const [name, setName]   = useState(user.user_metadata?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function saveName() {
    setSaving(true)
    try { await updateDisplayName(name); setSaved(true); setTimeout(() => setSaved(false), 2000) }
    catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{user.email}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            Connecté
            {user.is_super_admin && (
              <span style={{ fontSize: 10, background: `${C.primary}22`, color: C.light, borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>SUPER ADMIN</span>
            )}
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: '7px 16px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Déconnexion
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>Prénom / nom affiché</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Guillaume"
            style={{ width: '100%', padding: '8px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' as const }} />
        </div>
        <button onClick={saveName} disabled={saving}
          style={{ padding: '8px 14px', background: saved ? '#166534' : C.primary, color: C.bg, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          {saved ? '✓ Sauvegardé' : saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

// ── ManageTab ────────────────────────────────────────────────────
export function ManageTab({
  user, projects, currentProjectId, onLogout, updateDisplayName, isSuperAdmin,
}: {
  user: AuthUser
  projects: Project[]
  currentProjectId: string | null
  onLogout: () => void
  updateDisplayName: (n: string) => Promise<void>
  isSuperAdmin: boolean
}) {
  const [selectedId, setSelectedId] = useState(currentProjectId ?? projects[0]?.id ?? null)
  const selectedProject = projects.find(p => p.id === selectedId) ?? projects[0] ?? null

  // Determine current user's role on selected project
  const [userRole, setUserRole] = useState<Role | null>(null)
  useEffect(() => {
    if (!selectedProject) return
    if (selectedProject.owner_email === user.email || isSuperAdmin) { setUserRole('owner'); return }
    supabase.from('project_members').select('role')
      .eq('project_id', selectedProject.id).eq('user_email', user.email).single()
      .then(({ data }) => setUserRole(data?.role as Role ?? null))
  }, [selectedProject?.id, user.email, isSuperAdmin])

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Compte & projets</div>
        <div style={{ fontSize: 12, color: C.muted }}>Gérez votre compte et les accès à vos projets</div>
      </div>

      <Section title="Votre compte">
        <AccountForm user={user} onLogout={onLogout} updateDisplayName={updateDisplayName} />
      </Section>

      <Section title="Accès aux projets">
        {/* Project selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Projet</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {projects.map(p => (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                style={{
                  padding: '6px 14px', border: `2px solid ${p.id === selectedId ? C.primary : C.border}`,
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: p.id === selectedId ? `${C.primary}22` : 'transparent',
                  color: p.id === selectedId ? C.light : C.text,
                }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {selectedProject
          ? <ProjectMembers project={selectedProject} currentUser={user} userRole={userRole} />
          : <div style={{ fontSize: 12, color: C.muted }}>Aucun projet</div>}
      </Section>

      {isSuperAdmin && (
        <Section title="⚡ Super admin">
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            Vous avez accès à tous les projets de la plateforme. Les super admins sont définis par la variable d'environnement <code style={{ background: C.bg, padding: '1px 4px', borderRadius: 4 }}>SUPERADMINS</code>.
          </div>
        </Section>
      )}
    </div>
  )
}