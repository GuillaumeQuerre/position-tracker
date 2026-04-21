import { useState, useMemo, memo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Mock data ──────────────────────────────────────────────────────────────
const MOCK_KWS = [
  { id: 'kw1', keyword: 'chaussures running', url: 'url1', volume: 12100 },
  { id: 'kw2', keyword: 'basket trail homme', url: 'url1', volume: 4400 },
  { id: 'kw3', keyword: 'semelle orthopédique sport', url: 'url2', volume: 2900 },
  { id: 'kw4', keyword: 'avis nike pegasus', url: 'url2', volume: 6600 },
  { id: 'kw5', keyword: 'comparatif chaussures marathon', url: 'url3', volume: 3200 },
  { id: 'kw6', keyword: 'taille chaussure running', url: 'url3', volume: 1900 },
  { id: 'kw7', keyword: 'chaussure trail waterproof', url: 'url4', volume: 5500 },
  { id: 'kw8', keyword: 'promo running soldes', url: 'url4', volume: 8100 },
  { id: 'kw9', keyword: 'drop chaussure course', url: 'url1', volume: 1300 },
  { id: 'kw10', keyword: 'test hoka bondi', url: 'url2', volume: 7200 },
]

const MOCK_ACTIONS = [
  { id: 'act1', name: 'Refonte balises title', date: 7, color: '#818cf8', urlId: 'url1' },
  { id: 'act2', name: 'Ajout FAQ schema', date: 21, color: '#f59e0b', urlId: 'url2' },
]

const BG_COLOR = '#4b5563'
const GREEN = '#22c55e', RED = '#ef4444', WHITE = '#e5e7eb'

// Fixed seeds for deterministic curves
function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

function generateMockSeries() {
  const today = new Date()
  const start = subDays(today, 30)
  const dates: string[] = []
  for (let i = 0; i <= 30; i++) dates.push(format(addDays(start, i), 'yyyy-MM-dd'))

  const positions: Record<string, number[]> = {}
  for (let ki = 0; ki < MOCK_KWS.length; ki++) {
    const kw = MOCK_KWS[ki]
    const rng = seededRandom(ki * 1000 + 42)
    const base = 15 + Math.floor(rng() * 50)
    const arr: number[] = []
    let pos = base

    // Decide trend: kw1=green(gain), kw3=white(stable), kw7=red(loss), rest=random
    const trend = kw.id === 'kw1' ? 'gain' : kw.id === 'kw3' ? 'stable' : kw.id === 'kw7' ? 'loss' : 'random'

    for (let i = 0; i <= 30; i++) {
      const act = MOCK_ACTIONS.find(a => a.urlId === kw.url && i > a.date)
      if (act && i > act.date && i <= act.date + 10) {
        pos = Math.max(1, pos - rng() * 2.5)
      } else if (trend === 'gain') {
        pos = Math.max(1, pos - rng() * 1.2 + 0.3)
      } else if (trend === 'loss') {
        pos = Math.min(100, pos + rng() * 1.5 - 0.2)
      } else if (trend === 'stable') {
        pos += (rng() - 0.5) * 1.5
      } else {
        pos += (rng() - 0.48) * 3
      }
      pos = Math.max(1, Math.min(100, pos))
      arr.push(Math.round(pos))
    }
    positions[kw.id] = arr
    // Force stable curve to end at same position as start
    if (trend === 'stable') arr[30] = arr[0]
  }

  const series = dates.map((date, i) => {
    const entry: Record<string, any> = { date }
    for (const kw of MOCK_KWS) entry[kw.id] = positions[kw.id][i]
    return entry
  })

  return { series, dates, positions }
}

// ── Step definitions ───────────────────────────────────────────────────────
interface Step {
  title: string
  description: string
  focus: string | null
  highlightKws?: string[]
  highlightAction?: number
  showSidebar?: boolean
}

const STEPS: Step[] = [
  {
    title: 'Bienvenue sur Position Tracker',
    description: 'Ce graphique présente l\'évolution des positions de vos mots-clés dans les résultats Google. Chaque courbe représente un mot-clé suivi. Plus la courbe est haute (position 1), meilleur est le classement.',
    focus: 'chart',
  },
  {
    title: 'Sélectionner un mot-clé',
    description: 'Cliquez sur un mot-clé dans la liste de droite pour mettre en valeur sa courbe. La couleur indique la tendance : vert = en hausse, rouge = en baisse, blanc = stable.',
    focus: 'chart-curve',
    highlightKws: ['kw1', 'kw3', 'kw7'],
    showSidebar: true,
  },
  {
    title: 'Visualiser l\'impact d\'une action',
    description: 'Les marqueurs sur le graphique représentent vos actions SEO. Cliquez dessus pour voir les mots-clés impactés. Les courbes démarrent à la date de l\'action avec leur couleur d\'impact.',
    focus: 'chart-action',
    highlightAction: 0,
  },
  {
    title: 'Le panneau de navigation',
    description: 'La colonne de droite liste vos mots-clés avec leur position et leur évolution. Vous pouvez rechercher, filtrer et trier par A→Z, gains/pertes, ou volume.',
    focus: 'sidebar',
  },
  {
    title: 'Changer de vue',
    description: 'Ce menu permet de basculer entre différentes vues : mots-clés, catégories de mots-clés, URLs, ou catégories d\'URLs. Chaque vue regroupe les données différemment.',
    focus: 'sidebar-dropdown',
  },
  {
    title: 'Récapitulatif & Détail',
    description: 'Ces panneaux synthétisent vos données : hausse, baisse, position médiane, top 3/10/30. Le détail réagit au survol de n\'importe quel élément du graphique ou de la liste.',
    focus: 'bottom-panels',
  },
  { title: 'Onglet Mots-clés', description: 'Gérez vos mots-clés, assignez des catégories par tag ou regex, visualisez position et URL associée.', focus: 'tab-keywords' },
  { title: 'Onglet URLs', description: 'Visualisez vos pages positionnées, le nombre de mots-clés par URL, et organisez-les par catégories.', focus: 'tab-urls' },
  { title: 'Onglet Actions', description: 'Enregistrez vos actions SEO avec date, catégorie, temps passé et URLs. Le sous-onglet Roadmap planifie les actions à venir.', focus: 'tab-actions' },
  { title: 'Onglet Journal', description: 'Analysez l\'impact de vos actions à 7j, 1 mois, 3 mois. Explorez par thématique sémantique ou typologie de page.', focus: 'tab-journal' },
  { title: 'C\'est parti !', description: 'Importez votre premier CSV Semrush pour commencer. Vous pouvez relancer ce guide à tout moment avec le bouton ? en haut à droite.', focus: null },
]

// ── Chart component ────────────────────────────────────────────────────────
const OnboardingChart = memo(function OnboardingChart({
  series, step,
}: {
  series: any[]
  step: Step
}) {
  const actionData = step.highlightAction != null ? MOCK_ACTIONS[step.highlightAction] : null
  const actionKws = actionData ? MOCK_KWS.filter(k => k.url === actionData.urlId).map(k => k.id) : []
  const highlightKws = step.highlightKws ?? []
  const hasHighlight = highlightKws.length > 0 || actionKws.length > 0
  const actionDateIdx = actionData?.date ?? -1

  // For action step: null out values before action date for action kws
  const chartData = step.highlightAction != null
    ? series.map((row, i) => {
        if (i < actionDateIdx) {
          const newRow: Record<string, any> = { date: row.date }
          for (const kw of MOCK_KWS) {
            newRow[kw.id] = actionKws.includes(kw.id) ? null : row[kw.id]
          }
          return newRow
        }
        return row
      })
    : series

  function getKwColor(kwId: string): string {
    if (highlightKws.includes(kwId)) {
      if (kwId === 'kw1') return GREEN
      if (kwId === 'kw3') return WHITE
      if (kwId === 'kw7') return RED
    }
    if (actionKws.includes(kwId)) {
      // Color based on position change after action
      const posAtAction = series[actionDateIdx]?.[kwId]
      const posAtEnd = series[series.length - 1]?.[kwId]
      if (posAtAction != null && posAtEnd != null) {
        return posAtAction > posAtEnd ? GREEN : posAtAction < posAtEnd ? RED : WHITE
      }
    }
    return BG_COLOR
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 10, bottom: 10, left: 10 }}>
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1f2937' }}
          tickFormatter={d => { try { return format(new Date(d), 'd MMM', { locale: fr }) } catch { return d } }}
          interval="preserveStartEnd" />
        <YAxis reversed domain={[1, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} tickCount={6} width={25} />
        <ReferenceLine y={10} stroke="#374151" strokeDasharray="4 4" />
        <Tooltip
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null
            const withValues = payload.filter((p: any) => p.value != null && (highlightKws.includes(p.dataKey) || actionKws.includes(p.dataKey)))
            if (!withValues.length) return null
            let dateStr = label; try { dateStr = format(new Date(label), 'd MMM yyyy', { locale: fr }) } catch {}
            return (
              <div className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 shadow-xl pointer-events-none">
                <p className="text-[9px] text-gray-500 mb-1">{dateStr}</p>
                {withValues.sort((a: any, b: any) => a.value - b.value).map((p: any) => (
                  <div key={p.dataKey} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.stroke }} />
                    <span className="text-[10px] text-gray-300 truncate max-w-32">{p.name}</span>
                    <span className="text-[10px] font-mono font-semibold text-white ml-auto">#{p.value}</span>
                  </div>
                ))}
              </div>
            )
          }}
          cursor={{ stroke: '#374151', strokeWidth: 1 }}
        />
        {MOCK_KWS.map((kw) => {
          const isHl = highlightKws.includes(kw.id) || actionKws.includes(kw.id)
          return (
            <Line key={kw.id} type="monotone" dataKey={kw.id} name={kw.keyword}
              stroke={getKwColor(kw.id)}
              strokeWidth={isHl ? 2.5 : 0.8}
              opacity={isHl ? 1 : hasHighlight ? 0.12 : 0.5}
              connectNulls={step.highlightAction == null} isAnimationActive={false} dot={false}
              activeDot={isHl ? { r: 3, strokeWidth: 0 } : false} />
          )
        })}
        {actionData && series[actionDateIdx] && (
          <ReferenceLine x={series[actionDateIdx].date} stroke={actionData.color} strokeWidth={2} strokeDasharray="4 2" />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
})


// ── Sidebar mock for step 2 ────────────────────────────────────────────────
function MockSidebar() {
  const items = [
    { id: 'kw1', label: 'chaussures running', color: GREEN, pos: '42→28', active: true },
    { id: 'kw3', label: 'semelle orthopédique sport', color: WHITE, pos: '31→31', active: true },
    { id: 'kw7', label: 'chaussure trail waterproof', color: RED, pos: '18→29', active: true },
    { id: 'kw2', label: 'basket trail homme', color: BG_COLOR, pos: '35→30' },
    { id: 'kw4', label: 'avis nike pegasus', color: BG_COLOR, pos: '22→19' },
    { id: 'kw5', label: 'comparatif chaussures marathon', color: BG_COLOR, pos: '48→45' },
    { id: 'kw8', label: 'promo running soldes', color: BG_COLOR, pos: '15→20' },
  ]
  return (
    <div className="w-full h-full bg-gray-900 rounded-xl p-3 flex flex-col gap-2">
      <div className="bg-gray-800 rounded px-2 py-1 text-[11px] text-gray-300">Mots-clés ▾</div>
      <div className="bg-gray-800 rounded px-2 py-0.5 text-[11px] text-gray-500">Rechercher…</div>
      <div className="flex gap-px bg-gray-800 rounded p-0.5">
        <span className="flex-1 text-center bg-gray-700 rounded text-[9px] text-white py-0.5">A→Z</span>
        <span className="flex-1 text-center text-[9px] text-gray-500 py-0.5">↑↓</span>
        <span className="flex-1 text-center text-[9px] text-gray-500 py-0.5">Vol.</span>
      </div>
      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
        {items.map(item => (
          <div key={item.id} className={`flex items-center gap-1.5 px-2 py-1 rounded ${item.active ? 'bg-gray-800' : 'opacity-40'}`}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] text-gray-400 truncate">{item.label}</span>
            <span className="text-[8px] text-gray-600 font-mono ml-auto flex-shrink-0">({item.pos})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bottom panels mock ─────────────────────────────────────────────────────
function MockBottomPanels() {
  const pills = [
    { l: 'total', v: '10', c: undefined, big: true },
    { l: 'hausse', v: '4', c: GREEN },
    { l: 'baisse', v: '3', c: RED },
    { l: 'stable', v: '2', c: WHITE },
    { l: 'pos. méd.', v: '28', c: undefined, big: true },
    { l: 'top 10', v: '3', c: '#818cf8' },
  ]
  return (
    <div className="w-full h-full bg-gray-900 rounded-xl p-3 flex gap-2">
      <div className="flex-1 bg-gray-800/60 rounded-lg px-3 py-2">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Récapitulatif</span>
        <div className="grid grid-cols-3 gap-1 mt-1.5">
          {pills.map(p => (
            <div key={p.l} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 border-l-[3px] ${p.big ? 'bg-gray-900/80' : 'bg-gray-900/60'}`}
              style={{ borderLeftColor: p.c ?? '#6b7280' }}>
              <span className="text-sm font-bold font-mono" style={{ color: p.c ?? WHITE }}>{p.v}</span>
              <span className="text-[8px] text-gray-500">{p.l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-gray-800/60 rounded-lg px-3 py-2">
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Détail</span>
        <div className="flex-1 flex items-center justify-center mt-3">
          <p className="text-[10px] text-gray-600">Survolez un élément</p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0)
  const { series } = useMemo(() => generateMockSeries(), [])

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isTabStep = current.focus?.startsWith('tab-')
  const tabHighlight = isTabStep ? current.focus!.replace('tab-', '') : null
  const isChartStep = current.focus === 'chart' || current.focus === 'chart-curve' || current.focus === 'chart-action'

  // Focus zones
  const chartZone = { top: '60px', left: '24px', width: current.showSidebar ? 'calc(100% - 48px)' : 'calc(100% - 304px)', height: '55%' }
  const sidebarZone = { top: '60px', right: '24px', width: '264px', height: 'calc(100% - 84px)' }

  return (
    <div className="fixed inset-0 z-50">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" />

      {/* ── Chart focus ── */}
      {isChartStep && (
        <div className="absolute bg-gray-950 rounded-xl ring-2 ring-indigo-500/40 shadow-2xl flex"
          style={chartZone as any}>
          {/* Chart area */}
          <div className={`${current.showSidebar ? 'flex-1' : 'w-full'} h-full p-3 bg-gray-900 rounded-l-xl relative`}>
            <OnboardingChart series={series} step={current} />
            {/* Action labels — positioned relative to chart using date index percentage */}
            {(current.focus === 'chart' || current.focus === 'chart-action') && MOCK_ACTIONS.map((act, ai) => {
              if (current.focus === 'chart-action' && ai !== current.highlightAction) return null
              // X position: date index / 30 as percentage of chart width (accounting for margins)
              const xPct = (act.date / 30) * 100
              return (
                <div key={act.id} className="absolute" style={{
                  left: `calc(35px + ${xPct * 0.92}%)`,
                  top: 8,
                  transform: 'translateX(-50%)',
                  zIndex: 5,
                }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="px-1.5 py-0.5 rounded-md text-[7px] font-bold text-white shadow-lg"
                      style={{ backgroundColor: act.color, boxShadow: `0 2px 6px ${act.color}50` }}>
                      {act.name}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Sidebar in step 2 */}
          {current.showSidebar && (
            <div className="w-64 h-full flex-shrink-0">
              <MockSidebar />
            </div>
          )}
        </div>
      )}

      {/* ── Sidebar focus (step 4) ── */}
      {current.focus === 'sidebar' && (
        <>
          <div className="absolute bg-gray-950 rounded-xl ring-2 ring-indigo-500/40 shadow-2xl overflow-hidden"
            style={{ ...sidebarZone } as any}>
            <MockSidebar />
          </div>
          <div className="absolute flex items-center" style={{ top: 'calc(50% - 20px)', right: '310px' }}>
            <svg width="60" height="40" viewBox="0 0 60 40" className="animate-pulse">
              <path d="M5 20 H45 L35 10 M45 20 L35 30" stroke="#818cf8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      )}

      {/* ── Dropdown focus (step 5) ── */}
      {current.focus === 'sidebar-dropdown' && (
        <>
          <div className="absolute bg-gray-950 rounded-xl ring-2 ring-indigo-500/40 shadow-2xl overflow-hidden"
            style={{ top: '60px', right: '24px', width: '264px', height: '160px' } as any}>
            <div className="w-full h-full bg-gray-900 rounded-xl p-3 flex flex-col gap-1">
              <div className="bg-indigo-600/20 border border-indigo-500/30 rounded px-2.5 py-1.5 text-[11px] text-indigo-300 w-full flex items-center justify-between">
                <span>Mots-clés</span><span className="text-indigo-400">▾</span>
              </div>
              {['Catég. mots-clés', 'URLs', 'Catég. URLs'].map(label => (
                <div key={label} className="px-2.5 py-1.5 text-[11px] text-gray-500 hover:bg-gray-800 rounded">{label}</div>
              ))}
            </div>
          </div>
          <div className="absolute flex items-center" style={{ top: '80px', right: '310px' }}>
            <svg width="50" height="36" viewBox="0 0 50 36" className="animate-pulse">
              <path d="M5 18 H38 L30 9 M38 18 L30 27" stroke="#818cf8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      )}

      {/* ── Bottom panels focus (step 6) ── */}
      {current.focus === 'bottom-panels' && (
        <div className="absolute bg-gray-950 rounded-xl ring-2 ring-indigo-500/40 shadow-2xl overflow-hidden"
          style={{ bottom: '24px', left: '24px', width: 'calc(100% - 304px)', height: '150px' } as any}>
          <MockBottomPanels />
        </div>
      )}

      {/* ── Tab highlights ── */}
      {isTabStep && (
        <div className="absolute top-0 left-0 right-0 h-14 flex items-center px-6 gap-8">
          <div className="w-32" />
          <nav className="flex gap-1">
            {[
              { id: 'chart', label: 'Graphique', icon: '📈' },
              { id: 'keywords', label: 'Mots-clés', icon: '🔑' },
              { id: 'urls', label: 'URLs', icon: '🔗' },
              { id: 'actions', label: 'Actions', icon: '⚡' },
              { id: 'journal', label: 'Journal', icon: '📋' },
            ].map(tab => (
              <div key={tab.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                  ${tab.id === tabHighlight
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50 shadow-lg shadow-indigo-500/30'
                    : 'text-gray-600'}`}>
                <span className="text-xs">{tab.icon}</span>
                {tab.label}
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* ── Step card ── */}
      <div className="absolute left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl max-w-md w-full"
        style={{
          bottom: current.focus === 'bottom-panels' ? 'auto' : '60px',
          top: current.focus === 'bottom-panels' ? '60px' : 'auto',
        }}>
        <div className="flex gap-1 mb-4">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-500' : 'bg-gray-800'}`} />
          ))}
        </div>

        <h2 className="text-base font-semibold text-gray-100 mb-2">{current.title}</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">{current.description}</p>

        <div className="flex items-center justify-between">
          <button onClick={onFinish} className="text-xs text-gray-600 hover:text-gray-400">
            Passer le guide
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700">
                Précédent
              </button>
            )}
            <button onClick={() => isLast ? onFinish() : setStep(s => s + 1)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500">
              {isLast ? 'Commencer' : 'Suivant'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-gray-700 text-center mt-3">{step + 1} / {STEPS.length}</p>
      </div>
    </div>
  )
}