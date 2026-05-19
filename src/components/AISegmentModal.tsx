// components/AISegmentModal.tsx
// Analyse IA + segmentation automatique des mots-clés ou des URLs
// Étapes : analyse → proposition → validation → application → rollback possible

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a', dim: '#2a5050' }

type Mode = 'keywords' | 'urls'
type Step = 'idle' | 'analyzing' | 'proposing' | 'applying' | 'done' | 'error'

interface Category { name: string; color: string; items: string[] }
interface Proposal { categories: Category[]; reasoning: string }
interface Snapshot { kwTags: { keyword_id: string; category_id: string }[]; kwCats: { id: string; name: string; color: string }[]; urlTags: { url_id: string; category_id: string }[]; urlCats: { id: string; name: string; color: string }[] }

const COLORS_PALETTE = [
  '#317979','#a3f1eb','#5ba8a8','#2a6565','#4db8b8',
  '#c5a55a','#8b7355','#d4956a','#e8b4a0',
  '#6b8cba','#4a7a9b','#2d5f7a',
  '#7a6b8c','#9b7aa8','#c4a8d4',
  '#8c6b6b','#b87a7a','#d4a0a0',
  '#6b8c6b','#4a7a4a','#8cb88c',
]

function colorForIndex(i: number) { return COLORS_PALETTE[i % COLORS_PALETTE.length] }

// ── Claude API call ──────────────────────────────────────────────────────────
async function analyzeWithClaude(mode: Mode, items: string[]): Promise<Proposal> {
  const isKw = mode === 'keywords'
  const prompt = isKw
    ? `Tu es un expert SEO. Analyse cette liste de ${items.length} mots-clés et propose une segmentation thématique pertinente.

Mots-clés :
${items.slice(0, 300).join('\n')}${items.length > 300 ? `\n... et ${items.length - 300} autres` : ''}

Règles :
- Crée entre 5 et 15 catégories maximum
- Chaque catégorie doit avoir un nom court et descriptif (2-4 mots)
- Groupe les mots-clés par intention de recherche et thématique
- Chaque mot-clé doit appartenir à exactement une catégorie
- Nomme une catégorie "Autre" pour les mots-clés inclassables

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "categories": [
    { "name": "Nom catégorie", "items": ["mot-clé 1", "mot-clé 2"] }
  ],
  "reasoning": "Explication courte de la segmentation choisie (2-3 phrases)"
}`
    : `Tu es un expert SEO. Analyse cette liste de ${items.length} URLs et propose une segmentation par type de page.

URLs :
${items.slice(0, 200).join('\n')}${items.length > 200 ? `\n... et ${items.length - 200} autres` : ''}

Règles :
- Crée entre 3 et 10 types de pages maximum
- Exemples de types : "Pages catégorie", "Pages produit", "Articles blog", "Pages institutionnelles", "Landing pages", "Pages marque"
- Analyse les patterns d'URLs (slugs, profondeur, mots-clés dans l'URL)
- Chaque URL doit appartenir à exactement un type
- Nomme un type "Autre" pour les URLs inclassables

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "categories": [
    { "name": "Nom type", "items": ["/url-1", "/url-2"] }
  ],
  "reasoning": "Explication courte de la segmentation choisie (2-3 phrases)"
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const text = data.content?.find((b: any) => b.type === 'text')?.text ?? ''

  // Parse JSON — strip markdown fences if present
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(clean)
  return parsed as Proposal
}

// ── Snapshot for rollback ────────────────────────────────────────────────────
async function takeSnapshot(): Promise<Snapshot> {
  const [kwTags, kwCats, urlTags, urlCats] = await Promise.all([
    supabase.from('keyword_tags').select('keyword_id, category_id'),
    supabase.from('keyword_categories').select('id, name, color'),
    supabase.from('url_tags').select('url_id, category_id'),
    supabase.from('url_categories').select('id, name, color'),
  ])
  return {
    kwTags: kwTags.data ?? [], kwCats: kwCats.data ?? [],
    urlTags: urlTags.data ?? [], urlCats: urlCats.data ?? [],
  }
}

// ── Apply segmentation ───────────────────────────────────────────────────────
async function applySegmentation(
  mode: Mode, proposal: Proposal,
  kwMap: Map<string, string>, urlMap: Map<string, string>,
  projectId: string
): Promise<void> {
  if (mode === 'keywords') {
    for (let i = 0; i < proposal.categories.length; i++) {
      const cat = proposal.categories[i]
      const color = colorForIndex(i)
      // Upsert category
      const { data: catRow } = await supabase.from('keyword_categories')
        .upsert({ name: cat.name, color }, { onConflict: 'name' }).select('id').single()
      if (!catRow?.id) continue
      // Map keyword names → ids, then insert tags
      const kwIds = cat.items.map(kw => kwMap.get(kw)).filter(Boolean) as string[]
      if (kwIds.length > 0) {
        await supabase.from('keyword_tags')
          .upsert(kwIds.map(kid => ({ keyword_id: kid, category_id: catRow.id })), { onConflict: 'keyword_id,category_id' })
      }
    }
  } else {
    for (let i = 0; i < proposal.categories.length; i++) {
      const cat = proposal.categories[i]
      const color = colorForIndex(i)
      const { data: catRow } = await supabase.from('url_categories')
        .upsert({ name: cat.name, color }, { onConflict: 'name' }).select('id').single()
      if (!catRow?.id) continue
      const urlIds = cat.items.map(u => urlMap.get(u)).filter(Boolean) as string[]
      if (urlIds.length > 0) {
        await supabase.from('url_tags')
          .upsert(urlIds.map(uid => ({ url_id: uid, category_id: catRow.id })), { onConflict: 'url_id,category_id' })
      }
    }
  }
}

// ── Rollback ─────────────────────────────────────────────────────────────────
async function rollback(snapshot: Snapshot): Promise<void> {
  // Restore keyword tags
  await supabase.from('keyword_tags').delete().neq('keyword_id', '00000000-0000-0000-0000-000000000000')
  if (snapshot.kwTags.length > 0) await supabase.from('keyword_tags').insert(snapshot.kwTags)
  // Restore url tags
  await supabase.from('url_tags').delete().neq('url_id', '00000000-0000-0000-0000-000000000000')
  if (snapshot.urlTags.length > 0) await supabase.from('url_tags').insert(snapshot.urlTags)
}

// ── Category card in proposal ────────────────────────────────────────────────
function CategoryCard({ cat, index, onRename, onRemoveItem }: {
  cat: Category; index: number
  onRename: (name: string) => void
  onRemoveItem: (item: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cat.name)
  const color = colorForIndex(index)

  return (
    <div style={{ background: C.bg, border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {editing ? (
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { onRename(name); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(name); setEditing(false) } }}
            autoFocus
            style={{ flex: 1, background: C.surface, border: `1px solid ${C.primary}`, borderRadius: 5, padding: '2px 6px', fontSize: 12, color: C.text, outline: 'none' }} />
        ) : (
          <span onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text, cursor: 'text' }} title="Cliquer pour renommer">
            {cat.name}
          </span>
        )}
        <span style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>{cat.items.length}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {cat.items.slice(0, 12).map(item => (
          <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '2px 6px', borderRadius: 99, background: color + '15', color, border: `1px solid ${color}30`, cursor: 'pointer' }}
            onClick={() => onRemoveItem(item)} title="Retirer">
            {item.length > 30 ? item.slice(0, 28) + '…' : item}
            <span style={{ fontSize: 8, opacity: 0.6 }}>✕</span>
          </span>
        ))}
        {cat.items.length > 12 && (
          <span style={{ fontSize: 9, color: C.dim, padding: '2px 4px' }}>+{cat.items.length - 12} autres</span>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function AISegmentModal({ mode, onClose, onDone }: { mode: Mode; onClose: () => void; onDone: () => void }) {
  const { projectId } = useAppStore()
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [progress, setProgress] = useState('')
  const [rolledBack, setRolledBack] = useState(false)

  const isKw = mode === 'keywords'
  const title = isKw ? 'Auto-segmentation des mots-clés' : 'Auto-segmentation des URLs'
  const icon = isKw ? '🔑' : '🔗'

  const analyze = useCallback(async () => {
    setStep('analyzing'); setError(''); setProgress('Chargement des données…')

    try {
      const pid = projectId ?? '00000000-0000-0000-0000-000000000001'

      if (isKw) {
        setProgress('Récupération des mots-clés…')
        const { data: kws } = await supabase.from('keywords').select('id, keyword').eq('project_id', pid).order('keyword')
        if (!kws?.length) { setError('Aucun mot-clé trouvé dans ce projet.'); setStep('error'); return }
        setProgress(`Analyse de ${kws.length} mots-clés par Claude…`)
        const kwMap = new Map(kws.map(k => [k.keyword, k.id]))
        const result = await analyzeWithClaude('keywords', kws.map(k => k.keyword))
        setProposal(result)
        // Store kwMap in closure via state trick
        setStep('proposing')
        ;(window as any).__aiKwMap = kwMap
      } else {
        setProgress('Récupération des URLs…')
        const { data: urls } = await supabase.from('urls').select('id, url').eq('project_id', pid).order('url')
        if (!urls?.length) { setError('Aucune URL trouvée dans ce projet.'); setStep('error'); return }
        setProgress(`Analyse de ${urls.length} URLs par Claude…`)
        const urlMap = new Map(urls.map(u => [u.url, u.id]))
        const result = await analyzeWithClaude('urls', urls.map(u => u.url))
        setProposal(result)
        setStep('proposing')
        ;(window as any).__aiUrlMap = urlMap
      }
    } catch (e: any) {
      setError(`Erreur d'analyse : ${e.message}`)
      setStep('error')
    }
  }, [projectId, isKw])

  const apply = useCallback(async () => {
    if (!proposal) return
    setStep('applying'); setProgress('Sauvegarde de l\'état actuel…')
    const snap = await takeSnapshot()
    setSnapshot(snap)
    setProgress('Application de la segmentation…')
    const pid = projectId ?? '00000000-0000-0000-0000-000000000001'
    const kwMap: Map<string, string> = (window as any).__aiKwMap ?? new Map()
    const urlMap: Map<string, string> = (window as any).__aiUrlMap ?? new Map()
    try {
      await applySegmentation(mode, proposal, kwMap, urlMap, pid)
      setStep('done'); setProgress('')
    } catch (e: any) {
      setError(`Erreur d'application : ${e.message}`)
      setStep('error')
    }
  }, [proposal, mode, projectId])

  const doRollback = useCallback(async () => {
    if (!snapshot) return
    setStep('applying'); setProgress('Restauration de la segmentation précédente…')
    try {
      await rollback(snapshot)
      setRolledBack(true); setStep('done'); setProgress('')
      onDone()
    } catch (e: any) {
      setError(`Erreur de rollback : ${e.message}`)
      setStep('error')
    }
  }, [snapshot, onDone])

  // Editable proposal
  const renameCategory = (i: number, name: string) => {
    if (!proposal) return
    const cats = [...proposal.categories]
    cats[i] = { ...cats[i], name }
    setProposal({ ...proposal, categories: cats })
  }

  const removeItem = (catIdx: number, item: string) => {
    if (!proposal) return
    const cats = proposal.categories.map((c, i) => i === catIdx ? { ...c, items: c.items.filter(it => it !== item) } : c)
    setProposal({ ...proposal, categories: cats })
  }

  const totalAssigned = proposal?.categories.reduce((s, c) => s + c.items.length, 0) ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,18,18,0.85)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, width: '100%', maxWidth: step === 'proposing' ? 800 : 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', margin: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Powered by Claude — 4 étapes : analyse · proposition · validation · application
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 16, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 24px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          {[
            { id: 'idle', label: '① Démarrer' },
            { id: 'analyzing', label: '② Analyse' },
            { id: 'proposing', label: '③ Proposition' },
            { id: 'done', label: '④ Appliqué' },
          ].map((s, i, arr) => {
            const steps = ['idle', 'analyzing', 'proposing', 'applying', 'done']
            const currentIdx = steps.indexOf(step)
            const stepIdx = steps.indexOf(s.id)
            const isPast = currentIdx > stepIdx
            const isCurrent = s.id === step || (s.id === 'analyzing' && step === 'applying')
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                    background: isPast ? C.primary : isCurrent ? C.primary + '44' : C.surface,
                    border: `1.5px solid ${isPast || isCurrent ? C.primary : C.border}`,
                    color: isPast ? C.bg : isCurrent ? C.light : C.dim }}>
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 9, color: isPast || isCurrent ? C.light : C.dim, whiteSpace: 'nowrap' }}>{s.label.slice(2)}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: isPast ? C.primary : C.border, margin: '0 6px', marginBottom: 12 }} />}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── IDLE ── */}
          {step === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: C.bg, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                  {isKw ? 'Segmentation thématique des mots-clés' : 'Segmentation par type de page'}
                </div>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
                  {isKw
                    ? 'Claude va analyser tous vos mots-clés et les regrouper par intention de recherche et thématique. Vous pourrez valider et modifier la proposition avant application.'
                    : 'Claude va analyser vos URLs et les regrouper par type de page (catégories, produits, articles, etc.). Vous pourrez valider la proposition avant application.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['Analyse de vos données par Claude Sonnet', 'Proposition de catégories avec noms et assignations', 'Validation et modification manuelle possible', 'Rollback instantané vers la segmentation précédente'].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />{s}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={analyze} style={{ padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: C.primary, color: C.bg, border: 'none' }}>
                ✦ Lancer l'analyse
              </button>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {(step === 'analyzing' || (step === 'applying' && !snapshot)) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${C.primary}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Analyse en cours…</div>
              <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>{progress}</div>
            </div>
          )}

          {/* ── APPLYING (with snapshot) ── */}
          {step === 'applying' && snapshot && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${C.primary}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{progress}</div>
            </div>
          )}

          {/* ── PROPOSING ── */}
          {step === 'proposing' && proposal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Reasoning */}
              <div style={{ background: `${C.primary}12`, border: `1px solid ${C.primary}30`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Analyse de Claude</div>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{proposal.reasoning}</p>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: C.bg, borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.light, fontFamily: 'monospace' }}>{proposal.categories.length}</div>
                  <div style={{ fontSize: 9, color: C.muted }}>catégories</div>
                </div>
                <div style={{ flex: 1, background: C.bg, borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.light, fontFamily: 'monospace' }}>{totalAssigned}</div>
                  <div style={{ fontSize: 9, color: C.muted }}>{isKw ? 'mots-clés' : 'URLs'} assignés</div>
                </div>
              </div>

              {/* Hint */}
              <div style={{ fontSize: 10, color: C.dim, fontStyle: 'italic' }}>
                Cliquez sur un nom de catégorie pour le renommer · Cliquez sur un item pour le retirer
              </div>

              {/* Categories */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.categories.map((cat, i) => (
                  <CategoryCard key={i} cat={cat} index={i}
                    onRename={name => renameCategory(i, name)}
                    onRemoveItem={item => removeItem(i, item)} />
                ))}
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.primary}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {rolledBack ? '↩' : '✓'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                {rolledBack ? 'Segmentation restaurée' : 'Segmentation appliquée'}
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                {rolledBack
                  ? 'La segmentation précédente a été restaurée avec succès.'
                  : `${totalAssigned} ${isKw ? 'mots-clés ont été catégorisés' : 'URLs ont été catégorisées'} en ${proposal?.categories.length} groupes.`}
              </div>
              {!rolledBack && snapshot && (
                <button onClick={doRollback} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'transparent', color: '#f59e0b', border: '1px solid #f59e0b50' }}>
                  ↩ Annuler et restaurer la segmentation précédente
                </button>
              )}
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#2a0d0d', border: '1px solid #7f1d1d', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
              </div>
              <button onClick={() => { setStep('idle'); setError('') }} style={{ padding: '10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}>
                Réessayer
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'proposing' || step === 'done') && !rolledBack && (
          <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {step === 'proposing' && (
              <>
                <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'transparent', color: C.muted, border: `1px solid ${C.border}` }}>
                  Annuler
                </button>
                <button onClick={apply} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.primary, color: C.bg, border: 'none' }}>
                  ✓ Appliquer cette segmentation
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={() => { onDone(); onClose() }} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.primary, color: C.bg, border: 'none' }}>
                Terminer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Trigger button ───────────────────────────────────────────────────────────
export function AISegmentButton({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const isKw = mode === 'keywords'
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: 'transparent', border: `1px solid #317979`, color: '#a3f1eb' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#317979'; (e.currentTarget as HTMLElement).style.color = '#071212' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#a3f1eb' }}
        title={isKw ? 'Auto-segmenter les mots-clés avec Claude' : 'Auto-segmenter les URLs avec Claude'}>
        ✦ {isKw ? 'Auto-catégoriser' : 'Typer les pages'}
      </button>
      {open && (
        <AISegmentModal mode={mode} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone() }} />
      )}
    </>
  )
}