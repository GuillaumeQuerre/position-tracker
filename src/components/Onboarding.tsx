import { useState, useMemo, memo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Palette identique à l'app ──────────────────────────────────────────────
const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }
const GREEN = '#22c55e', RED = '#ef4444', AMBER = '#f59e0b', BG_CURVE = '#4b5563'

// ── Données mock ───────────────────────────────────────────────────────────
const MOCK_KWS = [
  { id: 'kw1', keyword: 'chaussures running', volume: 12100 },
  { id: 'kw2', keyword: 'basket trail homme', volume: 4400 },
  { id: 'kw3', keyword: 'semelle orthopédique sport', volume: 2900 },
  { id: 'kw4', keyword: 'avis nike pegasus', volume: 6600 },
  { id: 'kw5', keyword: 'comparatif chaussures marathon', volume: 3200 },
  { id: 'kw6', keyword: 'taille chaussure running', volume: 1900 },
  { id: 'kw7', keyword: 'chaussure trail waterproof', volume: 5500 },
  { id: 'kw8', keyword: 'promo running soldes', volume: 8100 },
]

const MOCK_ACTIONS = [
  { id: 'act1', name: 'Refonte balises title', dateIdx: 8,  color: '#818cf8', kwIds: ['kw1', 'kw2'] },
  { id: 'act2', name: 'Ajout FAQ schema',       dateIdx: 20, color: AMBER,     kwIds: ['kw3', 'kw4'] },
]

function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

function generateMockSeries() {
  const today = new Date()
  const dates: string[] = []
  for (let i = 0; i <= 30; i++) dates.push(format(addDays(subDays(today, 30), i), 'yyyy-MM-dd'))

  const positions: Record<string, number[]> = {}
  for (let ki = 0; ki < MOCK_KWS.length; ki++) {
    const kw = MOCK_KWS[ki]
    const rng = seededRandom(ki * 1337 + 99)
    const trend = kw.id === 'kw1' ? 'gain' : kw.id === 'kw3' ? 'stable' : kw.id === 'kw7' ? 'loss' : 'random'
    let pos = 15 + Math.floor(rng() * 45)
    const arr: number[] = []
    for (let i = 0; i <= 30; i++) {
      const hasAction = MOCK_ACTIONS.some(a => a.kwIds.includes(kw.id) && i > a.dateIdx && i <= a.dateIdx + 10)
      if (hasAction) pos = Math.max(1, pos - rng() * 2.5)
      else if (trend === 'gain')   pos = Math.max(1,   pos - rng() * 1.2 + 0.3)
      else if (trend === 'loss')   pos = Math.min(100, pos + rng() * 1.5 - 0.2)
      else if (trend === 'stable') pos += (rng() - 0.5) * 1.2
      else pos += (rng() - 0.48) * 3
      pos = Math.max(1, Math.min(100, pos))
      arr.push(Math.round(pos))
    }
    if (trend === 'stable') arr[30] = arr[0]
    positions[kw.id] = arr
  }

  return dates.map((date, i) => {
    const row: Record<string, any> = { date }
    for (const kw of MOCK_KWS) row[kw.id] = positions[kw.id][i]
    return row
  })
}

// ── Étapes ─────────────────────────────────────────────────────────────────
interface Step {
  title: string
  desc: string
  focus: 'chart' | 'chart-highlight' | 'chart-action' | 'chart-volume' | 'sidebar' | 'sidebar-sorts' | 'sidebar-filters' | 'bottom' | 'tab-keywords' | 'tab-urls' | 'tab-actions' | 'tab-journal' | 'tab-account' | 'end' | null
  highlightKws?: string[]
  actionIdx?: number
}

const STEPS: Step[] = [
  {
    title: 'Bienvenue sur Position Tracker',
    desc: 'Le graphique montre l\'évolution des positions de vos mots-clés sur Google. L\'axe Y est inversé : position 1 en haut, position 100 en bas. Les lignes de référence Top 3, Top 10 et Top 30 servent de repères visuels.',
    focus: 'chart',
  },
  {
    title: 'Courbes en couleur selon la tendance',
    desc: 'Chaque mot-clé a une couleur calculée sur la période : vert = en hausse, rouge = en baisse, blanc/gris = stable. Cliquez ou survolez un mot-clé dans la liste pour l\'isoler — toutes les autres courbes disparaissent pour focaliser l\'attention.',
    focus: 'chart-highlight',
    highlightKws: ['kw1', 'kw3', 'kw7'],
  },
  {
    title: 'Actions SEO sur le graphique',
    desc: 'Les lignes verticales représentent vos actions SEO. Cliquez dessus pour voir les mots-clés impactés mis en couleur à partir de la date de l\'action. Vous pouvez ainsi corréler visuellement chaque intervention avec son effet sur les positions.',
    focus: 'chart-action',
    actionIdx: 0,
  },
  {
    title: 'Vue Volume — trafic estimé vs objectif',
    desc: 'Basculez en mode Volume pour visualiser le trafic estimé (teal plein), l\'objectif 30% de captation (amber pointillé) et le volume de recherche potentiel (gris discret). Le badge de captation en haut à droite indique votre taux sur 10 niveaux de couleur.',
    focus: 'chart-volume',
  },
  {
    title: 'La liste des mots-clés',
    desc: 'La colonne de droite liste tous vos mots-clés avec leur couleur de tendance, position actuelle et évolution. Survolez pour isoler la courbe. Verrouillez la sélection en cliquant — cliquez à nouveau pour déverrouiller.',
    focus: 'sidebar',
  },
  {
    title: 'Tris et filtres de la liste',
    desc: 'Triez par A→Z, gains/pertes, position début/fin, volume. Un second clic sur le tri actif inverse la direction (↑/↓). Filtrez par ⚡ Quick wins (positions 4-15 à fort potentiel) ou ★ Favoris (mots-clés étoilés depuis l\'onglet Mots-clés).',
    focus: 'sidebar-sorts',
  },
  {
    title: 'Récapitulatif & Détail',
    desc: 'Ces deux panneaux réagissent à la sélection. Le récapitulatif affiche hausse/baisse/stable, position médiane, top 3/10/30. Le détail montre la courbe précise du mot-clé sélectionné avec ses positions début et fin de période.',
    focus: 'bottom',
  },
  {
    title: 'Onglet Mots-clés',
    desc: 'Gérez vos mots-clés : assignez des catégories par tag manuel, en masse ou par regex. Triez et filtrez par position, volume ou score opportunité (volume × (11-position) pour les pos. 4-10). Mettez en favori ★ vos mots-clés prioritaires.',
    focus: 'tab-keywords',
  },
  {
    title: 'Onglet URLs',
    desc: 'Visualisez vos pages positionnées avec le nombre de mots-clés par URL et leur meilleure position. Triez par URL, position ou nombre de mots-clés. Filtrez les URLs sans catégorie pour les taguer rapidement en masse.',
    focus: 'tab-urls',
  },
  {
    title: 'Onglet Actions',
    desc: 'Enregistrez vos actions SEO avec date, catégorie, owner, temps passé, URLs concernées. Le sous-onglet Roadmap planifie les actions à venir avec priorité et date prévue. Validez une action roadmap pour la basculer en réalisée.',
    focus: 'tab-actions',
  },
  {
    title: 'Onglet Journal',
    desc: 'Analysez l\'impact de vos actions sur 3 vues : chronologique (par date d\'action), thématique (par catégorie de mots-clés) et par type de page. Filtrez par amplitude de variation pour ne voir que les mouvements significatifs.',
    focus: 'tab-journal',
  },
  {
    title: 'Compte & gestion des accès',
    desc: 'Cliquez sur votre nom en haut à droite pour accéder aux paramètres. Vous pouvez inviter des collaborateurs sur un projet avec 3 niveaux : Administrateur (invitation + gestion des accès), Éditeur (lecture + écriture), Lecteur (consultation seule).',
    focus: 'tab-account',
  },
  {
    title: 'Importer vos données Semrush',
    desc: 'Cliquez sur Importer CSV en haut à droite et chargez un export Semrush Position Tracking. Les données s\'accumulent à chaque import — relancez ce guide à tout moment avec le bouton ? dans la barre de navigation.',
    focus: 'end',
  },
]

// ── Mini graphique mock ────────────────────────────────────────────────────
const MockChart = memo(function MockChart({ step, series }: { step: Step; series: any[] }) {
  const actionData  = step.actionIdx != null ? MOCK_ACTIONS[step.actionIdx] : null
  const hlKws       = step.highlightKws ?? actionData?.kwIds ?? []
  const hasHL       = hlKws.length > 0
  const actionDateIdx = actionData?.dateIdx ?? -1

  const chartData = actionData
    ? series.map((row, i) => {
        if (i < actionDateIdx) {
          const r: Record<string, any> = { date: row.date }
          for (const kw of MOCK_KWS) r[kw.id] = actionData.kwIds.includes(kw.id) ? null : row[kw.id]
          return r
        }
        return row
      })
    : series

  function kwColor(kwId: string) {
    if (!hasHL) return BG_CURVE
    if (hlKws.includes(kwId)) {
      if (kwId === 'kw1') return GREEN
      if (kwId === 'kw3') return '#e5e7eb'
      if (kwId === 'kw7') return RED
      // action-coloured keywords
      const posStart = series[actionDateIdx]?.[kwId]
      const posEnd   = series[series.length - 1]?.[kwId]
      if (posStart != null && posEnd != null) return posStart > posEnd ? GREEN : posStart < posEnd ? RED : '#e5e7eb'
    }
    return BG_CURVE
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 12, right: 10, bottom: 8, left: 10 }}>
        <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9 }} tickLine={false}
          axisLine={{ stroke: '#1f2937' }} interval="preserveStartEnd"
          tickFormatter={d => { try { return format(new Date(d), 'd MMM', { locale: fr }) } catch { return d } }} />
        <YAxis reversed domain={[1, 100]} tick={{ fill: C.muted, fontSize: 9 }} tickLine={false} axisLine={false} tickCount={5} width={22} />
        <ReferenceLine y={3}  stroke={C.primary} strokeDasharray="2 4" label={{ value: 'Top 3',  position: 'insideTopRight', fill: C.primary, fontSize: 8 }} />
        <ReferenceLine y={10} stroke={C.primary} strokeDasharray="4 4" label={{ value: 'Top 10', position: 'insideTopRight', fill: C.primary, fontSize: 8 }} />
        <ReferenceLine y={30} stroke={C.dim}     strokeDasharray="6 4" label={{ value: 'Top 30', position: 'insideTopRight', fill: C.dim,     fontSize: 8 }} />
        {actionData && series[actionDateIdx] && (
          <ReferenceLine x={series[actionDateIdx].date} stroke={actionData.color} strokeWidth={2} strokeDasharray="4 2"
            label={{ value: actionData.name, position: 'insideTopLeft', fill: actionData.color, fontSize: 8 }} />
        )}
        <Tooltip content={({ active, payload, label }: any) => {
          if (!active || !payload?.length) return null
          const with_ = payload.filter((p: any) => p.value != null && hlKws.includes(p.dataKey))
          if (!with_.length) return null
          let ds = label; try { ds = format(new Date(label), 'd MMM', { locale: fr }) } catch {}
          return (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 10, color: C.text }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>{ds}</div>
              {with_.sort((a: any, b: any) => a.value - b.value).map((p: any) => (
                <div key={p.dataKey} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.stroke, flexShrink: 0 }} />
                  <span style={{ color: C.muted, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontWeight: 700, marginLeft: 'auto', fontFamily: 'monospace' }}>#{p.value}</span>
                </div>
              ))}
            </div>
          )
        }} cursor={{ stroke: C.border, strokeWidth: 1 }} />
        {MOCK_KWS.map(kw => {
          const isHl = hlKws.includes(kw.id)
          return (
            <Line key={kw.id} type="monotone" dataKey={kw.id} name={kw.keyword}
              stroke={kwColor(kw.id)}
              strokeWidth={isHl ? 2 : 0.6}
              opacity={isHl ? 1 : hasHL ? 0 : 0.35}
              connectNulls={!actionData} isAnimationActive={false} dot={false}
              activeDot={isHl ? { r: 3, strokeWidth: 0 } : false} />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
})

// ── Mock Volume Chart ──────────────────────────────────────────────────────
function MockVolumeChart() {
  const data = Array.from({ length: 20 }, (_, i) => ({
    date: format(addDays(subDays(new Date(), 20), i), 'yyyy-MM-dd'),
    traffic:  Math.round(800 + Math.sin(i * 0.4) * 200 + i * 30),
    potential: Math.round(3000 + i * 10),
    obj30:    Math.round(900 + i * 12),
  }))
  const last = data[data.length - 1]
  const score = Math.round((last.traffic / last.obj30) * 100)
  const scoreColor = score >= 70 ? GREEN : score >= 50 ? AMBER : RED

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 4, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: C.surface, border: `1px solid ${scoreColor}40`, borderRadius: 8, padding: '3px 10px' }}>
        <span style={{ fontSize: 9, color: C.muted }}>Captation</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor, fontFamily: 'monospace' }}>{score}%</span>
        <span style={{ fontSize: 9, color: C.muted }}>de l'objectif</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 22, right: 10, bottom: 8, left: 10 }}>
          <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9 }} tickLine={false} axisLine={false}
            tickFormatter={d => { try { return format(new Date(d), 'd MMM', { locale: fr }) } catch { return d } }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickLine={false} axisLine={false} width={36}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
          <Line type="monotone" dataKey="potential" stroke={C.primary} strokeWidth={1} strokeDasharray="3 5" dot={false} isAnimationActive={false} opacity={0.4} />
          <Line type="monotone" dataKey="obj30"     stroke={AMBER}     strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="traffic"   stroke={C.light}   strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Mock sidebar ───────────────────────────────────────────────────────────
function MockSidebar({ showSorts }: { showSorts?: boolean }) {
  const items = [
    { kw: 'chaussures running',          color: GREEN,    pos: '42→28', starred: true,  active: true },
    { kw: 'semelle orthopédique sport',  color: '#e5e7eb', pos: '31→31', starred: false, active: true },
    { kw: 'chaussure trail waterproof',  color: RED,      pos: '18→29', starred: true,  active: true },
    { kw: 'basket trail homme',          color: BG_CURVE, pos: '35→30', starred: false, active: false },
    { kw: 'avis nike pegasus',           color: BG_CURVE, pos: '22→19', starred: false, active: false },
    { kw: 'promo running soldes',        color: BG_CURVE, pos: '15→20', starred: false, active: false },
  ]
  return (
    <div style={{ width: '100%', height: '100%', background: C.surface, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* View selector */}
      <div style={{ background: C.bg, borderRadius: 6, padding: '4px 8px', fontSize: 10, color: C.text, display: 'flex', justifyContent: 'space-between' }}>
        <span>Mots-clés</span><span style={{ color: C.muted }}>▾</span>
      </div>
      {/* Search */}
      <div style={{ background: C.bg, borderRadius: 6, padding: '4px 8px', fontSize: 10, color: C.dim }}>Rechercher…</div>
      {/* Sort buttons */}
      {showSorts && (
        <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 6, padding: 2 }}>
          {['A→Z ↑', '↑ Gains', 'Pos. fin ↑', 'Vol. ↓'].map((s, i) => (
            <span key={s} style={{ flex: 1, textAlign: 'center', fontSize: 8, padding: '2px 0', borderRadius: 4,
              background: i === 0 ? C.primary : 'transparent',
              color: i === 0 ? C.bg : C.muted }}>
              {s}
            </span>
          ))}
        </div>
      )}
      {/* Filter pills */}
      {showSorts && (
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 99, background: C.primary + '22', color: C.primary, border: `1px solid ${C.primary}40` }}>⚡ Quick wins</span>
          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 99, background: '#78350f', color: '#fcd34d', border: '1px solid #f59e0b40' }}>★ Favoris</span>
        </div>
      )}
      {/* Keyword list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
        {items.map(item => (
          <div key={item.kw} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
            background: item.active ? C.bg : 'transparent', opacity: item.active ? 1 : 0.4 }}>
            <span style={{ fontSize: 12, color: item.starred ? AMBER : C.dim }}>{item.starred ? '★' : '☆'}</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.kw}</span>
            <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', flexShrink: 0 }}>{item.pos}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mock bottom panels ─────────────────────────────────────────────────────
function MockBottomPanels() {
  const stats = [
    { l: 'hausse',   v: '4',  c: GREEN },
    { l: 'baisse',   v: '3',  c: RED },
    { l: 'stable',   v: '2',  c: '#e5e7eb' },
    { l: 'pos. méd.', v: '24', c: C.light },
    { l: 'top 3',    v: '1',  c: '#818cf8' },
    { l: 'top 10',   v: '3',  c: C.primary },
  ]
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, background: C.surface, borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Récapitulatif</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {stats.map(s => (
            <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: C.bg, borderRadius: 6, borderLeft: `2px solid ${s.c}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.c, fontFamily: 'monospace' }}>{s.v}</span>
              <span style={{ fontSize: 8, color: C.dim }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, background: C.surface, borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Détail sélection</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span style={{ color: C.text, fontWeight: 600 }}>chaussures running</span>
            <span style={{ color: GREEN }}>+14 pos.</span>
          </div>
          <div style={{ display: 'flex', gap: 6, fontSize: 9 }}>
            <span style={{ color: C.dim }}>Début :</span><span style={{ color: C.text }}>42</span>
            <span style={{ color: C.dim, marginLeft: 8 }}>Fin :</span><span style={{ color: GREEN }}>28</span>
          </div>
          <div style={{ height: 32, marginTop: 4, background: C.bg, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 8, color: C.dim }}>mini-graphique</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mock tabs ──────────────────────────────────────────────────────────────
const TAB_DEFS = [
  { id: 'chart',    label: 'Graphique', icon: '📈' },
  { id: 'keywords', label: 'Mots-clés', icon: '🔑' },
  { id: 'urls',     label: 'URLs',      icon: '🔗' },
  { id: 'actions',  label: 'Actions',   icon: '⚡' },
  { id: 'journal',  label: 'Journal',   icon: '📋' },
]

function MockHeader({ activeTab }: { activeTab: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.primary, marginRight: 8 }}>◈ Projet</div>
      {TAB_DEFS.map(tab => (
        <div key={tab.id} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
          background: tab.id === activeTab ? C.primary : 'transparent',
          color: tab.id === activeTab ? C.bg : C.muted,
          fontSize: 10, fontWeight: tab.id === activeTab ? 700 : 400,
        }}>
          <span style={{ fontSize: 10 }}>{tab.icon}</span>{tab.label}
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ padding: '3px 8px', background: C.surface, borderRadius: 6, fontSize: 9, color: C.muted }}>📥 CSV</div>
        <div style={{ padding: '3px 10px', background: C.surface, borderRadius: 6, fontSize: 9, color: C.text }}>◉ Guillaume</div>
      </div>
    </div>
  )
}

// ── Mock content par tab ───────────────────────────────────────────────────
function MockKeywordsTab() {
  const rows = [
    { kw: 'chaussures running', pos: 28, vol: '12.1k', score: '125k', star: true,  cannibal: false },
    { kw: 'basket trail homme', pos: 30, vol: '4.4k',  score: '18k',  star: false, cannibal: false },
    { kw: 'semelle orthopédique', pos: null, vol: '2.9k', score: '—',  star: true,  cannibal: true },
    { kw: 'avis nike pegasus',   pos: 8,  vol: '6.6k',  score: '19k',  star: false, cannibal: false },
    { kw: 'trail waterproof',    pos: 15, vol: '5.5k',  score: '27k',  star: false, cannibal: false },
  ]
  return (
    <div style={{ background: C.surface, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      {/* Toolbar */}
      <div style={{ padding: '6px 8px', background: C.bg, display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, background: C.surface, borderRadius: 4, padding: '3px 8px', fontSize: 9, color: C.dim }}>Rechercher…</div>
        <span style={{ fontSize: 8, padding: '3px 8px', borderRadius: 4, background: C.primary, color: C.bg }}>⚡ Quick wins</span>
        <span style={{ fontSize: 8, padding: '3px 8px', borderRadius: 4, background: '#78350f', color: '#fcd34d' }}>★ Favoris</span>
        <span style={{ fontSize: 8, padding: '3px 8px', borderRadius: 4, background: C.surface, color: C.muted }}>Catégories</span>
      </div>
      {/* Table */}
      <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.bg }}>
            {['★', 'Mot-clé ↑', 'Position ↕', 'Volume ↕', '⚡ Score ↕', 'URL', 'Tags'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: C.primary, fontWeight: 600, fontSize: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}40`, background: r.cannibal ? '#1a0505' : 'transparent' }}>
              <td style={{ padding: '4px 8px', color: r.star ? AMBER : C.dim }}>{r.star ? '★' : '☆'}</td>
              <td style={{ padding: '4px 8px', color: r.cannibal ? '#f87171' : C.text }}>
                {r.kw} {r.cannibal && <span style={{ fontSize: 7, color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 3, padding: '0 3px' }}>⚠ cannib.</span>}
              </td>
              <td style={{ padding: '4px 8px' }}>
                {r.pos ? <span style={{ padding: '1px 6px', borderRadius: 99, background: r.pos <= 10 ? '#0d2a1a' : r.pos <= 30 ? C.surface : C.bg, color: r.pos <= 10 ? GREEN : r.pos <= 30 ? C.light : C.muted, border: `1px solid ${r.pos <= 10 ? '#166534' : C.border}`, fontSize: 8 }}>{r.pos}</span> : <span style={{ color: C.dim }}>—</span>}
              </td>
              <td style={{ padding: '4px 8px', color: C.muted, fontFamily: 'monospace' }}>{r.vol}</td>
              <td style={{ padding: '4px 8px', color: C.light, fontFamily: 'monospace' }}>{r.score}</td>
              <td style={{ padding: '4px 8px', color: C.dim, fontSize: 8 }}>…/running</td>
              <td style={{ padding: '4px 8px' }}>
                <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 99, background: '#1a3060', color: '#60a5fa' }}>Running</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MockUrlsTab() {
  const rows = [
    { url: '/chaussures-running', pos: 28, kws: 4, tag: 'Catégorie A' },
    { url: '/basket-trail',       pos: 30, kws: 3, tag: null },
    { url: '/guides/semelles',    pos: null, kws: 2, tag: 'Guides' },
    { url: '/avis/nike-pegasus',  pos: 8,  kws: 3, tag: null },
  ]
  return (
    <div style={{ background: C.surface, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div style={{ padding: '6px 8px', background: C.bg, display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, background: C.surface, borderRadius: 4, padding: '3px 8px', fontSize: 9, color: C.dim }}>Rechercher une URL…</div>
        <span style={{ fontSize: 8, padding: '3px 8px', borderRadius: 4, background: C.primary + '22', color: C.primary, border: `1px solid ${C.primary}40` }}>2 sans tag</span>
      </div>
      <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.bg }}>
            {['URL ↑', 'Position ↕', 'Mots-clés ↕', 'Tags'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: C.primary, fontWeight: 600, fontSize: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${C.border}40` }}>
              <td style={{ padding: '4px 8px', color: C.muted }}>{r.url}</td>
              <td style={{ padding: '4px 8px' }}>
                {r.pos ? <span style={{ padding: '1px 6px', borderRadius: 99, background: r.pos <= 10 ? '#0d2a1a' : C.surface, color: r.pos <= 10 ? GREEN : C.muted, border: `1px solid ${r.pos <= 10 ? '#166534' : C.border}`, fontSize: 8 }}>{r.pos}</span> : <span style={{ color: C.dim }}>—</span>}
              </td>
              <td style={{ padding: '4px 8px', color: C.text, fontFamily: 'monospace', textAlign: 'center' }}>{r.kws}</td>
              <td style={{ padding: '4px 8px' }}>
                {r.tag ? <span style={{ fontSize: 7, padding: '1px 6px', borderRadius: 99, background: C.primary + '22', color: C.primary }}>{r.tag}</span>
                  : <span style={{ fontSize: 7, color: C.dim }}>— sans tag —</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MockActionsTab() {
  return (
    <div style={{ display: 'flex', gap: 8, height: 160 }}>
      {/* Form */}
      <div style={{ width: 160, background: C.surface, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.text }}>Nouvelle action</div>
        <div style={{ background: C.bg, borderRadius: 4, padding: '3px 6px', fontSize: 8, color: C.dim }}>Nom *</div>
        <div style={{ display: 'flex', gap: 2 }}>
          {['Refonte title', 'Maillage', 'Contenu'].map(c => (
            <span key={c} style={{ flex: 1, fontSize: 6, padding: '2px 3px', textAlign: 'center', borderRadius: 3, background: c === 'Refonte title' ? C.primary + '30' : C.bg, color: c === 'Refonte title' ? C.primary : C.dim, border: `1px solid ${C.border}` }}>{c}</span>
          ))}
        </div>
        <div style={{ background: C.bg, borderRadius: 4, padding: '3px 6px', fontSize: 8, color: C.dim }}>Catégorie</div>
        <div style={{ marginTop: 'auto', background: C.primary, borderRadius: 4, padding: '3px 6px', fontSize: 8, color: C.bg, textAlign: 'center', fontWeight: 700 }}>Ajouter</div>
      </div>
      {/* List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ padding: '3px 10px', background: C.primary, color: C.bg, borderRadius: 6, fontSize: 8, fontWeight: 700 }}>Réalisées (3)</span>
          <span style={{ padding: '3px 10px', background: C.surface, color: C.muted, borderRadius: 6, fontSize: 8 }}>Roadmap (2)</span>
        </div>
        {[
          { name: 'Refonte balises title', cat: 'On-page', date: '12 avr.', color: '#818cf8' },
          { name: 'Ajout FAQ schema', cat: 'Technique', date: '08 avr.', color: AMBER },
          { name: 'Optimisation maillage', cat: 'Maillage', date: '02 avr.', color: GREEN },
        ].map(a => (
          <div key={a.name} style={{ background: C.bg, borderRadius: 6, padding: '5px 8px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: C.text, flex: 1 }}>{a.name}</span>
            <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 99, background: a.color + '20', color: a.color }}>{a.cat}</span>
            <span style={{ fontSize: 7, color: C.dim }}>{a.date}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MockJournalTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {['Chronologique', 'Thématique', 'Type de page'].map((v, i) => (
          <span key={v} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 8, background: i === 0 ? C.primary : C.surface, color: i === 0 ? C.bg : C.muted, fontWeight: i === 0 ? 700 : 400 }}>{v}</span>
        ))}
      </div>
      {[
        { date: '12 avr. 2025', action: 'Refonte balises title', gain: '+14', loss: '0', neutral: '2' },
        { date: '08 avr. 2025', action: 'Ajout FAQ schema', gain: '+3', loss: '1', neutral: '4' },
      ].map(e => (
        <div key={e.date} style={{ background: C.surface, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: C.muted }}>{e.date}</span>
            <span style={{ fontSize: 8, color: '#818cf8', padding: '1px 6px', background: '#818cf820', borderRadius: 4 }}>{e.action}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 8, color: GREEN }}>↑ {e.gain}</span>
            <span style={{ fontSize: 8, color: RED }}>↓ {e.loss}</span>
            <span style={{ fontSize: 8, color: C.muted }}>→ {e.neutral}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MockAccountTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Account section */}
      <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primary + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.light }}>G</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>guillaume@deux.io</div>
            <div style={{ fontSize: 8, color: C.muted }}>Connecté · <span style={{ color: C.light, background: C.primary + '20', padding: '0 4px', borderRadius: 3 }}>SUPER ADMIN</span></div>
          </div>
          <div style={{ marginLeft: 'auto', padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 8, color: '#ef4444' }}>Déconnexion</div>
        </div>
      </div>
      {/* Members section */}
      <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.07em' }}>Membres du projet</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { email: 'guillaume@deux.io', role: 'Administrateur', roleColor: C.light },
            { email: 'alice@agence.fr',   role: 'Éditeur',        roleColor: C.primary },
            { email: 'bob@client.com',    role: 'Lecteur',        roleColor: C.muted },
          ].map(m => (
            <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: m.roleColor + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: m.roleColor }}>{m.email[0].toUpperCase()}</div>
              <span style={{ fontSize: 8, color: C.text, flex: 1 }}>{m.email}</span>
              <span style={{ fontSize: 7, padding: '1px 6px', borderRadius: 99, background: m.roleColor + '18', color: m.roleColor, border: `1px solid ${m.roleColor}40` }}>{m.role}</span>
            </div>
          ))}
        </div>
        {/* Invite */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <div style={{ flex: 1, background: C.bg, borderRadius: 4, padding: '3px 6px', fontSize: 8, color: C.dim }}>email@exemple.com</div>
          <span style={{ fontSize: 7, padding: '3px 6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted }}>Éditeur ▾</span>
          <span style={{ fontSize: 7, padding: '3px 8px', background: C.primary, borderRadius: 4, color: C.bg, fontWeight: 700 }}>Inviter</span>
        </div>
      </div>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [stepIdx, setStepIdx] = useState(0)
  const series = useMemo(() => generateMockSeries(), [])

  const step  = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  // Détermine la tab active pour le mock header
  const focusToTab: Record<string, string> = {
    'tab-keywords': 'keywords', 'tab-urls': 'urls',
    'tab-actions': 'actions', 'tab-journal': 'journal', 'tab-account': 'chart',
  }
  const mockActiveTab = focusToTab[step.focus ?? ''] ?? 'chart'

  const isChartFocus  = step.focus === 'chart' || step.focus === 'chart-highlight' || step.focus === 'chart-action'
  const isVolumeFocus = step.focus === 'chart-volume'
  const isSidebarFocus = step.focus === 'sidebar' || step.focus === 'sidebar-sorts'
  const isBottomFocus = step.focus === 'bottom'
  const isTabFocus    = step.focus?.startsWith('tab-')

  // Dimensions zones
  const CHART_W  = 'calc(100% - 320px)'
  const SIDEBAR_W = '270px'
  const TOP = '24px'
  const CHART_H  = '52vh'
  const BOTTOM_H = '140px'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,18,18,0.88)', backdropFilter: 'blur(2px)' }} />

      {/* ── Zone graphique ── */}
      {(isChartFocus || isSidebarFocus) && (
        <div style={{
          position: 'absolute', top: TOP, left: '24px',
          width: isSidebarFocus ? CHART_W : (step.focus === 'sidebar' || step.highlightKws ? 'calc(100% - 320px)' : 'calc(100% - 48px)'),
          height: CHART_H,
          background: C.surface, border: `1px solid ${C.primary}60`, borderRadius: 14,
          boxShadow: `0 0 0 2px ${C.primary}30`,
        }}>
          <MockChart step={step} series={series} />
        </div>
      )}

      {/* ── Zone volume ── */}
      {isVolumeFocus && (
        <div style={{
          position: 'absolute', top: TOP, left: '24px',
          width: 'calc(100% - 48px)', height: CHART_H,
          background: C.surface, border: `1px solid ${C.primary}60`, borderRadius: 14,
          boxShadow: `0 0 0 2px ${C.primary}30`,
        }}>
          <MockVolumeChart />
        </div>
      )}

      {/* ── Zone sidebar ── */}
      {(isChartFocus && (step.highlightKws || step.focus === 'chart')) && (
        <div style={{
          position: 'absolute', top: TOP, right: '24px',
          width: SIDEBAR_W, height: CHART_H,
        }}>
          <MockSidebar showSorts={false} />
        </div>
      )}
      {isSidebarFocus && (
        <div style={{
          position: 'absolute', top: TOP, right: '24px',
          width: SIDEBAR_W, height: CHART_H,
          border: `1px solid ${C.primary}60`, borderRadius: 14,
          boxShadow: `0 0 0 2px ${C.primary}30`,
        }}>
          <MockSidebar showSorts={step.focus === 'sidebar-sorts'} />
        </div>
      )}

      {/* ── Zone bottom panels ── */}
      {isBottomFocus && (
        <div style={{
          position: 'absolute', top: TOP, left: '24px',
          width: 'calc(100% - 48px)', height: BOTTOM_H,
          border: `1px solid ${C.primary}60`, borderRadius: 14,
          boxShadow: `0 0 0 2px ${C.primary}30`,
          padding: 8,
        }}>
          <MockBottomPanels />
        </div>
      )}

      {/* ── Zone onglets ── */}
      {isTabFocus && (
        <div style={{ position: 'absolute', top: TOP, left: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header simulé */}
          <MockHeader activeTab={mockActiveTab} />
          {/* Contenu de l'onglet */}
          <div style={{ border: `1px solid ${C.primary}60`, borderRadius: 14, padding: 12, background: C.surface, boxShadow: `0 0 0 2px ${C.primary}30` }}>
            {step.focus === 'tab-keywords' && <MockKeywordsTab />}
            {step.focus === 'tab-urls'     && <MockUrlsTab />}
            {step.focus === 'tab-actions'  && <MockActionsTab />}
            {step.focus === 'tab-journal'  && <MockJournalTab />}
            {step.focus === 'tab-account'  && <MockAccountTab />}
          </div>
        </div>
      )}

      {/* ── Carte de navigation ── */}
      <div style={{
        position: 'absolute',
        bottom: step.focus === 'bottom' ? 'auto' : '32px',
        top:    step.focus === 'bottom' ? '200px' : 'auto',
        left: '50%', transform: 'translateX(-50%)',
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 18, padding: '20px 24px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        width: '100%', maxWidth: 440,
        zIndex: 10,
      }}>
        {/* Barre de progression */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStepIdx(i)} style={{
              height: 3, flex: 1, borderRadius: 99, cursor: 'pointer',
              background: i <= stepIdx ? C.primary : C.border,
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 10, color: C.primary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Étape {stepIdx + 1} / {STEPS.length}
        </div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, lineHeight: 1.3 }}>{step.title}</h2>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65, marginBottom: 20 }}>{step.desc}</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onFinish} style={{ fontSize: 11, color: C.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Passer le guide
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIdx > 0 && (
              <button onClick={() => setStepIdx(s => s - 1)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                background: C.bg, color: C.muted, border: `1px solid ${C.border}`,
              }}>Précédent</button>
            )}
            <button onClick={() => isLast ? onFinish() : setStepIdx(s => s + 1)} style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: C.primary, color: C.bg, border: 'none',
            }}>
              {isLast ? '🚀 Commencer' : 'Suivant →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}