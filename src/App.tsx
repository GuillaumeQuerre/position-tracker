import React, { useState, useCallback, useEffect } from 'react'
import { ChartTab } from './tabs/ChartTab'
import { KeywordsTab } from './tabs/KeywordsTab'
import { UrlsTab } from './tabs/UrlsTab'
import { ActionsTab } from './tabs/ActionsTab'
import { JournalTab } from './tabs/JournalTab'
import { CsvImporter } from './components/CsvImporter'
import { Onboarding } from './components/Onboarding'
import { ProjectSelector } from './components/ProjectSelector'

// Wrapper to handle optional preselectedUrls prop regardless of ActionsTab version
const ActionsTabWrapper = ActionsTab as React.ComponentType<{ preselectedUrls?: string[] }>

type Tab = 'chart' | 'keywords' | 'urls' | 'actions' | 'journal'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chart',    label: 'Graphique',  icon: '📈' },
  { id: 'keywords', label: 'Mots-clés',  icon: '🔑' },
  { id: 'urls',     label: 'URLs',       icon: '🔗' },
  { id: 'actions',  label: 'Actions',    icon: '⚡' },
  { id: 'journal',  label: 'Journal',    icon: '📋' },
]

const ONBOARDING_KEY = 'position-tracker-onboarding-done'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [preselectedActionUrls, setPreselectedActionUrls] = useState<string[]>([])

  // Show onboarding on first visit
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDING_KEY)) {
        setShowOnboarding(true)
      }
    } catch {
      // localStorage not available
    }
  }, [])

  const handleImportDone = useCallback(() => {
    setRefreshKey(k => k + 1)
    setActiveTab('chart')
  }, [])

  const handleOnboardingFinish = useCallback(() => {
    setShowOnboarding(false)
    try { window.localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
  }, [])

  const handleNavigateToActions = useCallback((urlIds: string[]) => {
    setPreselectedActionUrls(urlIds)
    setActiveTab('actions')
  }, [])

  // Keyboard shortcuts: 1-5 for tabs, Escape to clear selections
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Ignore if modifier keys held (except plain digits)
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tabMap: Record<string, Tab> = {
        '1': 'chart', '2': 'keywords', '3': 'urls', '4': 'actions', '5': 'journal'
      }
      if (tabMap[e.key]) { e.preventDefault(); setActiveTab(tabMap[e.key]) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Clear preselected URLs once ActionsTab has mounted with them
  useEffect(() => {
    if (activeTab !== 'actions') setPreselectedActionUrls([])
  }, [activeTab])

  return (
    <div className="min-h-screen bg-[#060e1a] text-gray-100">
      {showOnboarding && <Onboarding onFinish={handleOnboardingFinish} />}

      <header className="border-b border-[#1a2744] px-6 py-3
        flex items-center gap-8 sticky top-0 z-40 bg-[#060e1a]/95 backdrop-blur">

        <ProjectSelector />

        <nav className="flex gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={`Raccourci : ${i + 1}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                text-sm transition-all duration-150
                ${activeTab === tab.id
                  ? 'bg-[#317979] text-[#071212] font-semibold'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#0f1a2e]'}`}
            >
              <span className="text-xs">{tab.icon}</span>
              {tab.label}
              <span className={`text-[9px] ml-0.5 ${activeTab === tab.id ? 'opacity-60' : 'opacity-30'}`}>{i + 1}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowOnboarding(true)}
            className="text-gray-600 hover:text-gray-400 text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors"
            title="Guide d'utilisation"
          >
            ?
          </button>
          <CsvImporter onImportDone={handleImportDone} />
        </div>
      </header>

      <main className="px-6 py-5">
        <div style={{ display: activeTab === 'chart' ? 'block' : 'none' }}>
          <ChartTab key={refreshKey} onNavigateToActions={handleNavigateToActions} />
        </div>
        <div style={{ display: activeTab === 'keywords' ? 'block' : 'none' }}>
          <KeywordsTab key={refreshKey} />
        </div>
        <div style={{ display: activeTab === 'urls' ? 'block' : 'none' }}>
          <UrlsTab key={refreshKey} />
        </div>
        <div style={{ display: activeTab === 'actions' ? 'block' : 'none' }}>
          <ActionsTabWrapper key={refreshKey} preselectedUrls={preselectedActionUrls} />
        </div>
        <div style={{ display: activeTab === 'journal' ? 'block' : 'none' }}>
          <JournalTab key={refreshKey} />
        </div>
      </main>
    </div>
  )
}