import React, { useState, useCallback, useEffect } from 'react'
import { ChartTab }    from './tabs/ChartTab'
import { KeywordsTab } from './tabs/KeywordsTab'
import { UrlsTab }     from './tabs/UrlsTab'
import { ActionsTab }  from './tabs/ActionsTab'
import { JournalTab }  from './tabs/JournalTab'
import { CsvImporter } from './components/CsvImporter'
import { Onboarding }  from './components/Onboarding'
import { ProjectSelector } from './components/ProjectSelector'
import { LoginPage }   from './components/LoginPage'
import { ManageTab }  from './tabs/ManageTab'
import { useAuth }     from './hooks/useAuth'
import { useAppStore } from './store/useAppStore'
import { supabase } from './lib/supabase'

const ActionsTabWrapper = ActionsTab as React.ComponentType<{ preselectedUrls?: string[] }>

type Tab = 'chart' | 'keywords' | 'urls' | 'actions' | 'journal' | 'account'

const TABS: { id: Tab; label: string; icon: string; hideForReader?: boolean }[] = [
  { id: 'chart',    label: 'Graphique',  icon: '📈' },
  { id: 'keywords', label: 'Mots-clés',  icon: '🔑' },
  { id: 'urls',     label: 'URLs',       icon: '🔗' },
  { id: 'actions',  label: 'Actions',    icon: '⚡' },
  { id: 'journal',  label: 'Journal',    icon: '📋' },
]

const ONBOARDING_KEY = 'position-tracker-onboarding-done'

// Handle /reset-password in hash URL
function useResetPasswordFlow() {
  const [resetToken, setResetToken] = useState<string | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const t = params.get('access_token')
    const type = params.get('type')
    if (t && type === 'recovery') {
      setResetToken(t)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])
  return resetToken
}

export default function App() {
  const { user, loading: authLoading, error: authError, isSuperAdmin, login, signup, logout, forgotPassword, resetPassword, updateDisplayName } = useAuth()
  const { projectId } = useAppStore()
  const resetToken = useResetPasswordFlow()
  const [projects, setProjects] = useState<{ id: string; name: string; owner_email: string | null }[]>([])

useEffect(() => {
  if (!user) { setProjects([]); return }
  supabase
    .from('projects')
    .select('id, name, owner_email')
    .order('created_at')
    .then(({ data }) => setProjects(data ?? []))
}, [user])

  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [preselectedActionUrls, setPreselectedActionUrls] = useState<string[]>([])
  const [resetStatus, setResetStatus] = useState<'idle' | 'success'>('idle')
  const [resetPwd, setResetPwd] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState('')

  useEffect(() => {
    try { if (!window.localStorage.getItem(ONBOARDING_KEY)) setShowOnboarding(true) } catch {}
  }, [])

  const handleImportDone = useCallback(() => { setRefreshKey(k => k + 1); setActiveTab('chart') }, [])
  const handleOnboardingFinish = useCallback(() => {
    setShowOnboarding(false)
    try { window.localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
  }, [])
  const handleNavigateToActions = useCallback((urlIds: string[]) => {
    setPreselectedActionUrls(urlIds); setActiveTab('actions')
  }, [])

  useEffect(() => { if (activeTab !== 'actions') setPreselectedActionUrls([]) }, [activeTab])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tabMap: Record<string, Tab> = { '1': 'chart', '2': 'keywords', '3': 'urls', '4': 'actions', '5': 'journal' }
      if (tabMap[e.key]) { e.preventDefault(); setActiveTab(tabMap[e.key]) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ── Reset password flow ──────────────────────────────────────
  if (resetToken && resetStatus !== 'success') {
    return (
      <div style={{ minHeight: '100vh', background: '#071212', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 400, width: '100%', background: '#0d1f1f', border: '1px solid #1a3535', borderRadius: 16, padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#a3f1eb', marginBottom: 20 }}>Nouveau mot de passe</div>
          {resetError && <div style={{ background: '#2a0d0d', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>{resetError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="Nouveau mot de passe"
              style={{ padding: '10px 12px', background: '#071212', border: '1px solid #1a3535', borderRadius: 8, color: '#f6f6f6', fontSize: 13 }} />
            <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="Confirmer"
              style={{ padding: '10px 12px', background: '#071212', border: '1px solid #1a3535', borderRadius: 8, color: '#f6f6f6', fontSize: 13 }} />
            <button onClick={async () => {
              if (resetPwd.length < 8) { setResetError('8 caractères minimum'); return }
              if (resetPwd !== resetConfirm) { setResetError('Mots de passe différents'); return }
              try { await resetPassword(resetToken, resetPwd); setResetStatus('success') }
              catch (e: any) { setResetError(e.message) }
            }} style={{ padding: '10px', background: '#317979', color: '#071212', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Valider
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (resetStatus === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: '#071212', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#a3f1eb' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mot de passe mis à jour !</div>
          <button onClick={() => { setResetStatus('idle') }} style={{ marginTop: 12, padding: '8px 20px', background: '#317979', color: '#071212', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Se connecter →
          </button>
        </div>
      </div>
    )
  }

  // ── Not authenticated ────────────────────────────────────────
  if (!user) {
    return <LoginPage onLogin={login} onSignup={signup} onForgotPassword={forgotPassword} loading={authLoading} error={authError} />
  }

  // ── Authenticated ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#060e1a] text-gray-100">
      {showOnboarding && <Onboarding onFinish={handleOnboardingFinish} />}

      <header className="border-b border-[#1a2744] px-6 py-3 flex items-center gap-8 sticky top-0 z-40 bg-[#060e1a]/95 backdrop-blur">
        <ProjectSelector />

        <nav className="flex gap-1">
          {TABS.map((tab, i) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={`Raccourci : ${i + 1}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150
                ${activeTab === tab.id ? 'bg-[#317979] text-[#071212] font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-[#0f1a2e]'}`}>
              <span className="text-xs">{tab.icon}</span>
              {tab.label}
              <span className={`text-[9px] ml-0.5 ${activeTab === tab.id ? 'opacity-60' : 'opacity-30'}`}>{i + 1}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowOnboarding(true)}
            className="text-gray-600 hover:text-gray-400 text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors" title="Guide">?</button>

          {/* User avatar / account */}
          <button onClick={() => setActiveTab('account')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${activeTab === 'account' ? 'bg-[#317979] text-[#071212]' : 'text-gray-400 hover:text-gray-200 hover:bg-[#0f1a2e]'}`}>
            <span style={{ fontSize: 14 }}>👤</span>
            <span>{user.user_metadata?.display_name || user.email?.split('@')[0]}</span>
            {isSuperAdmin && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#a3f1eb30', color: '#a3f1eb' }}>SA</span>}
          </button>

          <CsvImporter onImportDone={handleImportDone} />
        </div>
      </header>

      <main className="px-6 py-5">
        <div style={{ display: activeTab === 'chart'    ? 'block' : 'none' }}><ChartTab key={refreshKey} onNavigateToActions={handleNavigateToActions} /></div>
        <div style={{ display: activeTab === 'keywords' ? 'block' : 'none' }}><KeywordsTab key={refreshKey} /></div>
        <div style={{ display: activeTab === 'urls'     ? 'block' : 'none' }}><UrlsTab key={refreshKey} /></div>
        <div style={{ display: activeTab === 'actions'  ? 'block' : 'none' }}><ActionsTabWrapper key={refreshKey} preselectedUrls={preselectedActionUrls} /></div>
        <div style={{ display: activeTab === 'journal'  ? 'block' : 'none' }}><JournalTab key={refreshKey} /></div>
        {activeTab === 'account' && (
          <ManageTab user={user} projects={projects}
    currentProjectId={projectId ?? null} onLogout={logout} updateDisplayName={updateDisplayName} isSuperAdmin={isSuperAdmin} />
        )}
      </main>
    </div>
  )
}