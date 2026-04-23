// tabs/ManageTab.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { AuthUser } from '../hooks/useAuth'

const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

type Role = 'admin' | 'editor' | 'reader'

const ROLE_LABELS: Record<Role, string> = {
  admin:  'Administrateur',
  editor: 'Éditeur',
  reader: 'Lecteur',
}
const ROLE_COLORS: Record<Role, string> = {
  admin:  '#a3f1eb',
  editor: '#317979',
  reader: '#4a7a7a',
}
const ROLE_DESC: Record<Role, string> = {
  admin:  'Édition, lecture, invitation, gestion des accès',
  editor: 'Édition et lecture',
  reader: 'Lecture uniquement',
}

interface Member { id: string; user_email: string; role: Role; invited_by: string | null; created_at: string }
interface Project { id: string; name: string; owner_email: string | null }

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

function RoleBadge({ role }: { role: Role }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: ROLE_COLORS[role] + '18', color: ROLE_COLORS[role],
      border: `1px solid ${ROLE_COLORS[role]}40`,
    }}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ── Project Members ──────────────────────────────────────────────
function ProjectMembers({
  project, currentUser, userRole, isSuperAdmin,
}: {
  project: Project
  currentUser: AuthUser
  userRole: Role | null
  isSuperAdmin: boolean
}) {
  const [members, setMembers]   = useState<Member[]>([])
  const [loading, setLoading]   = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole]   = useState<Role>('editor')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Admin = créateur du projet OU membre avec rôle admin OU superadmin
  const isCreator = project.owner_email === currentUser.email
  const canManage = isSuperAdmin || isCreator || userRole === 'admin'

  useEffect(() => {
    setLoading(true)
    supabase.from('project_members').select('*')
      .eq('project_id', project.id).order('created_at')
      .then(({ data }) => { setMembers(data ?? []); setLoading(false) })
  }, [project.id])

  async function addMember() {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    if (email === currentUser.email) { setError('Vous êtes déjà sur ce projet'); return }
    if (members.some(m => m.user_email === email)) { setError('Cet email est déjà membre'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('project_members').insert({
      project_id: project.id, user_email: email, role: newRole, invited_by: currentUser.email,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setMembers(prev => [...prev, {
      id: crypto.randomUUID(), user_email: email, role: newRole,
      invited_by: currentUser.email, created_at: new Date().toISOString(),
    }])
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
      {/* Légende des rôles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['admin', 'editor', 'reader'] as Role[]).map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <RoleBadge role={r} />
            <span style={{ fontSize: 10, color: C.dim }}>{ROLE_DESC[r]}</span>
          </div>
        ))}
      </div>

      {/* Créateur du projet */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Créateur
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: `${C.primary}10`, borderRadius: 8, border: `1px solid ${C.primary}30`, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.primary}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.light, flexShrink: 0 }}>
          {(project.owner_email ?? '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.light }}>{project.owner_email ?? '—'}</div>
        </div>
        <RoleBadge role="admin" />
      </div>

      {/* Membres */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Membres ({members.length})
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {members.length === 0 && (
            <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic', padding: '12px 0' }}>Aucun membre invité</div>
          )}
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: ROLE_COLORS[m.role] + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ROLE_COLORS[m.role], flexShrink: 0 }}>
                {m.user_email[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{m.user_email}</div>
                {m.invited_by && (
                  <div style={{ fontSize: 10, color: C.dim }}>Invité par {m.invited_by}</div>
                )}
              </div>
              {canManage ? (
                <select
                  value={m.role}
                  onChange={e => changeRole(m.id, e.target.value as Role)}
                  style={{ fontSize: 11, padding: '4px 8px', background: C.surface, border: `1px solid ${ROLE_COLORS[m.role]}40`, borderRadius: 6, color: ROLE_COLORS[m.role], cursor: 'pointer', outline: 'none' }}>
                  <option value="admin">Administrateur</option>
                  <option value="editor">Éditeur</option>
                  <option value="reader">Lecteur</option>
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}
              {canManage && (
                <button
                  onClick={() => removeMember(m.id)}
                  title="Retirer ce membre"
                  style={{ fontSize: 12, color: C.dim, background: 'none', border: 'none', cursor: 'pointer', padding: '4px', lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invitation — admins seulement */}
      {canManage && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Inviter un utilisateur
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: '#2a0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="email"
              value={newEmail}
              onChange={e => { setNewEmail(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              placeholder="email@exemple.com"
              style={{ flex: 1, padding: '8px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none' }} />
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as Role)}
              style={{ padding: '8px 10px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, cursor: 'pointer', outline: 'none' }}>
              <option value="admin">Administrateur</option>
              <option value="editor">Éditeur</option>
              <option value="reader">Lecteur</option>
            </select>
            <button
              onClick={addMember}
              disabled={saving || !newEmail.includes('@')}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: saving || !newEmail.includes('@') ? 'not-allowed' : 'pointer',
                background: saving || !newEmail.includes('@') ? C.dim : C.primary,
                color: C.bg,
              }}>
              {saving ? '…' : 'Inviter'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>
            L'utilisateur doit avoir un compte pour accéder au projet.
          </div>
        </div>
      )}

      {/* Info lecteur/éditeur */}
      {!canManage && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: C.dim }}>
            Seuls les administrateurs du projet peuvent inviter des membres et modifier les accès.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Account form ─────────────────────────────────────────────────
function AccountForm({ user, onLogout, updateDisplayName }: {
  user: AuthUser; onLogout: () => void; updateDisplayName: (n: string) => Promise<void>
}) {
  const [name, setName]     = useState(user.user_metadata?.display_name ?? '')
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${C.primary}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: C.light }}>
            {(user.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{user.email}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              Connecté
              {user.is_super_admin && (
                <span style={{ fontSize: 10, background: `${C.primary}22`, color: C.light, borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>SUPER ADMIN</span>
              )}
            </div>
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

  const [userRole, setUserRole] = useState<Role | null>(null)
  useEffect(() => {
    if (!selectedProject) return
    if (isSuperAdmin || selectedProject.owner_email === user.email) { setUserRole('admin'); return }
    supabase.from('project_members').select('role')
      .eq('project_id', selectedProject.id).eq('user_email', user.email).single()
      .then(({ data }) => setUserRole((data?.role as Role) ?? null))
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
          ? <ProjectMembers project={selectedProject} currentUser={user} userRole={userRole} isSuperAdmin={isSuperAdmin} />
          : <div style={{ fontSize: 12, color: C.muted }}>Aucun projet</div>}
      </Section>

      {isSuperAdmin && (
        <Section title="⚡ Super admin">
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            Vous avez accès à tous les projets de la plateforme en tant que super administrateur.
            <br />Les super admins sont définis via la variable d'env <code style={{ background: C.bg, padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>SUPERADMINS</code>.
          </div>
        </Section>
      )}
    </div>
  )
}