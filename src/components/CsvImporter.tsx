import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/useAppStore'

interface ParsedRow {
  keyword: string
  position: number
  url: string | null
  tag: string | null
  volume: number | null
  date: string
}

interface ConflictInfo {
  dates: string[]
  counts: Record<string, number>
  rows: ParsedRow[]
}

const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
]

const C = { bg: '#071212', surface: '#0d1f1f', border: '#1a3535', primary: '#317979', light: '#a3f1eb', text: '#f6f6f6', muted: '#4a7a7a' }

function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = '' }
    else { current += char }
  }
  cols.push(current.trim())
  return cols
}

function parseSemrushCsv(text: string): { rows: ParsedRow[]; date: string } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let date = new Date().toISOString().split('T')[0]
  for (const line of lines) {
    const m = line.match(/Period:\s*(\d{8})\s*-\s*(\d{8})/)
    if (m) { const r = m[2]; date = r.slice(0,4)+'-'+r.slice(4,6)+'-'+r.slice(6,8); break }
  }
  const hi = lines.findIndex(l => l.trim().startsWith('Keyword'))
  if (hi === -1) throw new Error('En-tête "Keyword" introuvable')
  const headers = parseCSVLine(lines[hi])
  let positionColIdx = 1
  const tagIdx = headers.findIndex(h => h === 'Tags')
  const landingIdx = (() => {
    const names = ['URL', 'Landing URL', 'Landing', 'url', 'landing url']
    for (const n of names) { const i = headers.findIndex(h => h === n); if (i >= 0) return i }
    return headers.findIndex(h => /_\d{8}_landing$/i.test(h))
  })()
  const volumeIdx = headers.findIndex(h => h === 'Volume' || h === 'Search Volume')
  const col1DateMatch = headers[1]?.match(/_(\d{8})$/)
  if (col1DateMatch && !headers[1]?.includes('_type') && !headers[1]?.includes('_landing')) {
    const raw = col1DateMatch[1]
    date = raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)
    positionColIdx = 1
  }
  const rows: ParsedRow[] = []
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue
    if (line.startsWith('-')) continue
    const cols = parseCSVLine(line)
    const keyword = cols[0]?.replace(/^"|"$/g, '').trim(); if (!keyword) continue
    const posRaw = cols[positionColIdx]?.replace(/^"|"$/g, '').trim()
    let position = parseInt(posRaw ?? '')
    if (isNaN(position) || position < 1) position = 100
    if (position > 100) position = 100
    const url = landingIdx >= 0 ? cols[landingIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const tag = tagIdx >= 0 ? cols[tagIdx]?.replace(/^"|"$/g, '').trim() || null : null
    let volume: number | null = null
    if (volumeIdx >= 0) {
      const raw = cols[volumeIdx]?.replace(/^"|"$/g,'').replace(/[,\s]/g,'').trim()
      const p = parseInt(raw ?? ''); if (!isNaN(p) && p >= 0) volume = p
    }
    rows.push({ keyword, position, url, tag, volume, date })
  }
  return { rows, date }
}

function parseExtendedSemrushCsv(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const hi = lines.findIndex(l => l.trim().startsWith('Keyword'))
  if (hi === -1) throw new Error('En-tête "Keyword" introuvable')
  const headers = parseCSVLine(lines[hi])
  const tagIdx = headers.findIndex(h => h === 'Tags')
  const volumeIdx = headers.findIndex(h => h === 'Search Volume')
  interface DateCol { date: string; colIdx: number; landingColIdx: number | null }
  const dateCols: DateCol[] = []
  for (let c = 1; c < headers.length; c++) {
    const h = headers[c]; if (!h) continue
    if (!/_\d{8}/.test(h)) continue
    if (/_\d{8}_type$/i.test(h)) continue
    if (/_\d{8}_landing$/i.test(h)) continue
    if (/_\d{8}_visibility$/i.test(h)) continue
    if (h.endsWith('_difference') || h.endsWith('_visibility_difference')) continue
    const m = h.match(/_(\d{8})$/); if (!m) continue
    const raw = m[1]
    const date = raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)
    if (dateCols.some(d => d.date === date)) continue
    const landingKey = `_${raw}_landing`
    const landingColIdx = headers.findIndex(hh => hh.endsWith(landingKey))
    dateCols.push({ date, colIdx: c, landingColIdx: landingColIdx >= 0 ? landingColIdx : null })
  }
  if (dateCols.length === 0) throw new Error('Aucune colonne de date dans l\'export étendu')
  const rows: ParsedRow[] = []
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line || line.startsWith('-')) continue
    const cols = parseCSVLine(line)
    const keyword = cols[0]?.replace(/^"|"$/g, '').trim(); if (!keyword) continue
    const tag = tagIdx >= 0 ? cols[tagIdx]?.replace(/^"|"$/g,'').trim() || null : null
    let volume: number | null = null
    if (volumeIdx >= 0) {
      const raw = cols[volumeIdx]?.replace(/^"|"$/g,'').replace(/[,\s]/g,'').trim()
      const p = parseInt(raw ?? ''); if (!isNaN(p) && p >= 0) volume = p
    }
    for (const { date, colIdx, landingColIdx } of dateCols) {
      const posRaw = cols[colIdx]?.replace(/^"|"$/g,'').trim()
      if (!posRaw || posRaw === '' || posRaw === '-') continue
      let position = parseInt(posRaw)
      if (isNaN(position) || position < 1) continue
      if (position > 100) position = 100
      const url = landingColIdx != null ? cols[landingColIdx]?.replace(/^"|"$/g,'').trim() || null : null
      rows.push({ keyword, position, url, tag, volume, date })
    }
  }
  return rows
}

function detectAndParseCsv(text: string): { rows: ParsedRow[]; dates: string[]; isExtended: boolean } {
  const headerLine = text.replace(/\r\n/g,'\n').split('\n').find(l => l.trim().startsWith('Keyword')) ?? ''
  const headers = parseCSVLine(headerLine)
  const dateColCount = headers.filter(h => /_\d{8}$/.test(h) && !/_type$/.test(h) && !/_landing$/.test(h) && !/_visibility$/.test(h) && !h.endsWith('_difference')).length
  if (dateColCount > 1) {
    const rows = parseExtendedSemrushCsv(text)
    const dates = [...new Set(rows.map(r => r.date))].sort()
    return { rows, dates, isExtended: true }
  }
  const { rows, date } = parseSemrushCsv(text)
  return { rows, dates: [date], isExtended: false }
}

async function importRows(
  rows: ParsedRow[], projectId: string, language: string, overwrite: boolean,
  onProgress: (n: number) => void
) {
  let imported = 0, skipped = 0, errors = 0, volumeUpdated = 0, cannibalisations = 0

  // Pre-fetch or create all keywords at once
  const uniqueKeywords = [...new Set(rows.map(r => r.keyword))]
  const { data: existingKws } = await supabase.from('keywords')
    .select('id, keyword, volume').eq('project_id', projectId).in('keyword', uniqueKeywords)
  const kwMap = new Map<string, { id: string; volume: number | null }>()
  for (const kw of existingKws ?? []) kwMap.set(kw.keyword, { id: kw.id, volume: kw.volume })

  // Insert missing keywords with language
  const missingKws = uniqueKeywords.filter(k => !kwMap.has(k))
  if (missingKws.length > 0) {
    const { data: newKws } = await supabase.from('keywords')
      .insert(missingKws.map(k => ({ keyword: k, project_id: projectId, language })))
      .select('id, keyword, volume')
    for (const kw of newKws ?? []) kwMap.set(kw.keyword, { id: kw.id, volume: kw.volume })
  }

  // Pre-fetch or create URLs
  const uniqueUrls = [...new Set(rows.map(r => r.url).filter(Boolean) as string[])]
  const urlMap = new Map<string, string>()
  if (uniqueUrls.length > 0) {
    const { data: existingUrls } = await supabase.from('urls').select('id, url').in('url', uniqueUrls)
    for (const u of existingUrls ?? []) urlMap.set(u.url, u.id)
    const missingUrls = uniqueUrls.filter(u => !urlMap.has(u))
    if (missingUrls.length > 0) {
      const { data: newUrls } = await supabase.from('urls')
        .insert(missingUrls.map(u => ({ url: u, project_id: projectId }))).select('id, url')
      for (const u of newUrls ?? []) urlMap.set(u.url, u.id)
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const kw = kwMap.get(row.keyword); if (!kw) { errors++; continue }
      const urlId = row.url ? urlMap.get(row.url) ?? null : null

      // Update volume if changed
      if (row.volume != null && row.volume !== kw.volume) {
        await supabase.from('keywords').update({ volume: row.volume }).eq('id', kw.id)
        kw.volume = row.volume; volumeUpdated++
      }

      const { data: currentPos } = await supabase.from('positions')
        .select('id, position, url_id').eq('keyword_id', kw.id).eq('date', row.date).eq('project_id', projectId)

      if (currentPos && currentPos.length > 0) {
        if (!overwrite) { skipped++; continue }
        const updatePayload: any = { position: row.position, project_id: projectId }
        if (urlId) updatePayload.url_id = urlId
        await supabase.from('positions').update(updatePayload).eq('id', currentPos[0].id)
        imported++
      } else {
        const { error: pe } = await supabase.from('positions').insert(
          { keyword_id: kw.id, url_id: urlId, position: row.position, date: row.date, project_id: projectId }
        )
        if (pe) { errors++ } else { imported++ }
        if (urlId && currentPos?.length && !currentPos[0].url_id) {
          await supabase.from('positions').update({ url_id: urlId }).eq('id', currentPos[0].id)
        }
      }

      // Cannibalisation detection
      if (urlId && currentPos && currentPos.length > 0 && currentPos[0].url_id && currentPos[0].url_id !== urlId) {
        await supabase.from('cannibalisation').upsert({
          keyword_id: kw.id, old_url_id: currentPos[0].url_id, new_url_id: urlId,
          detected_at: row.date
        }, { onConflict: 'keyword_id' })
        cannibalisations++
      }
    } catch { errors++ }
    onProgress(i + 1)
  }
  return { imported, skipped, errors, volumeUpdated, cannibalisations }
}

// ── Import URLs depuis CSV ─────────────────────────────────────────────────
async function importUrlsCsv(text: string, projectId: string): Promise<{ imported: number; skipped: number }> {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const urls = lines
    .map(l => l.split(/[,;\t]/)[0].trim().replace(/^["']+|["']+$/g, ''))
    .filter(u => u && (u.startsWith('http') || u.startsWith('/')))
  const unique = [...new Set(urls)]
  if (!unique.length) return { imported: 0, skipped: 0 }

  // Check existing in unranked_urls
  const { data: existing } = await supabase.from('unranked_urls').select('url').in('url', unique)
  const existingSet = new Set((existing ?? []).map(u => u.url))
  const toInsert = unique.filter(u => !existingSet.has(u))

  if (toInsert.length > 0) {
    await supabase.from('unranked_urls').insert(toInsert.map(url => ({ url, project_id: projectId, visible: true })))
  }
  return { imported: toInsert.length, skipped: unique.length - toInsert.length }
}

interface Props { onImportDone: () => void }

export function CsvImporter({ onImportDone }: Props) {
  const { projectId } = useAppStore()
  const [status, setStatus] = useState<'idle'|'parsing'|'checking'|'importing'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [pendingRows, setPendingRows] = useState<ParsedRow[]>([])
  const [isExtended, setIsExtended] = useState(false)
  const [language, setLanguage] = useState('fr')
  const [showLang, setShowLang] = useState(false)
  const [urlImportMsg, setUrlImportMsg] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    setStatus('parsing'); setMessage('Lecture du fichier…'); setConflict(null); setProgress(0); setUrlImportMsg('')
    try {
      const text = await file.text()
      const { rows, dates, isExtended: ext } = detectAndParseCsv(text)
      setIsExtended(ext)
      if (rows.length === 0) { setStatus('error'); setMessage('Aucun mot-clé trouvé — vérifie le format du fichier'); return }
      setTotal(rows.length); setStatus('checking')
      setMessage(ext
        ? `Export étendu · ${dates.length} dates · ${rows.length} entrées…`
        : `${rows.length} mots-clés pour le ${dates[0]}…`)
      const conflictCounts: Record<string, number> = {}
      for (const date of dates) {
        const { count } = await supabase.from('positions').select('id', { count: 'exact', head: true }).eq('date', date).eq('project_id', projectId)
        if (count && count > 0) conflictCounts[date] = count
      }
      const conflictDates = Object.keys(conflictCounts)
      if (conflictDates.length > 0) {
        setConflict({ dates: conflictDates, counts: conflictCounts, rows })
        setPendingRows(rows); setStatus('idle'); setMessage(''); return
      }
      await runImport(rows, false)
    } catch (err: any) { setStatus('error'); setMessage(`Erreur : ${err.message}`) }
  }

  async function handleUrlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    setUrlImportMsg('Import URLs…')
    try {
      const text = await file.text()
      const result = await importUrlsCsv(text, projectId ?? '00000000-0000-0000-0000-000000000001')
      setUrlImportMsg(`✓ ${result.imported} URL${result.imported > 1 ? 's' : ''} ajoutée${result.imported > 1 ? 's' : ''}${result.skipped > 0 ? ` · ${result.skipped} déjà présentes` : ''}`)
      onImportDone()
    } catch (err: any) { setUrlImportMsg(`Erreur : ${err.message}`) }
  }

  async function runImport(rows: ParsedRow[], overwrite: boolean) {
    setStatus('importing'); setConflict(null); setProgress(0); setTotal(rows.length)
    setMessage(`Import de ${rows.length} entrées…`)
    const result = await importRows(rows, projectId ?? '00000000-0000-0000-0000-000000000001', language, overwrite, (n) => {
      setProgress(n); setMessage(`Import… ${n}/${rows.length}`)
    })
    setStatus('done')
    setMessage(`✓ ${result.imported} importés`
      + (result.skipped > 0 ? ` · ${result.skipped} ignorés` : '')
      + (result.errors > 0 ? ` · ${result.errors} erreurs` : '')
      + (result.volumeUpdated > 0 ? ` · ${result.volumeUpdated} volumes` : '')
      + (result.cannibalisations > 0 ? ` · ⚠ ${result.cannibalisations} cannibalisations` : ''))
    onImportDone()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>

      {/* ── Sélecteur de langue ── */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowLang(v => !v)}
          style={{ padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: C.surface, border: `1px solid ${C.border}`, color: C.light, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{LANGUAGES.find(l => l.code === language)?.code.toUpperCase()}</span>
          <span style={{ fontSize: 8, color: C.muted }}>▾</span>
        </button>
        {showLang && (
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, zIndex: 100, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => { setLanguage(l.code); setShowLang(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', border: 'none',
                  background: l.code === language ? `${C.primary}22` : 'transparent',
                  color: l.code === language ? C.light : C.muted,
                  fontWeight: l.code === language ? 600 : 400,
                }}>
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Import Semrush CSV ── */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: status === 'importing' ? 'not-allowed' : 'pointer',
        background: status === 'importing' ? C.surface : C.primary, color: C.bg,
      }}>
        <span>↑</span>
        {status === 'importing' ? `${progress}/${total}` : 'CSV Semrush'}
        <input type="file" accept=".csv" onChange={handleFile} disabled={status === 'importing'} style={{ display: 'none' }} />
      </label>

      {/* ── Import URLs CSV ── */}
      <label title="Importer une liste d'URLs (CSV ou TXT, 1 URL par ligne)" style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.light }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted }}>
        <span>🔗</span> URLs
        <input type="file" accept=".csv,.txt" onChange={handleUrlFile} style={{ display: 'none' }} />
      </label>

      {/* ── Messages ── */}
      {(status === 'checking' || status === 'importing' || status === 'done') && !conflict && (
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
          background: isExtended ? '#1a2a3a' : '#1a2a1a',
          border: `1px solid ${isExtended ? C.primary : C.muted}`,
          color: isExtended ? C.light : C.muted }}>
          {isExtended ? '⊞ Multi-dates' : '⊟ Standard'}
        </span>
      )}
      {message && !conflict && (
        <span style={{ fontSize: 11, color: status === 'done' ? '#4ade80' : status === 'error' ? '#f87171' : C.muted }}>
          {message}
        </span>
      )}
      {urlImportMsg && (
        <span style={{ fontSize: 11, color: urlImportMsg.startsWith('✓') ? '#4ade80' : urlImportMsg.startsWith('Erreur') ? '#f87171' : C.muted }}>
          {urlImportMsg}
        </span>
      )}

      {/* ── Modale conflit ── */}
      {conflict && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24, maxWidth: 440, width: '100%', margin: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Données existantes détectées</h2>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
                background: isExtended ? '#1a2a3a' : '#1a2a1a',
                border: `1px solid ${isExtended ? C.primary : C.muted}`,
                color: isExtended ? C.light : C.muted }}>
                {isExtended ? '⊞ Multi-dates' : '⊟ Standard'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
              Des positions existent déjà pour{' '}
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>{conflict.dates.length} date{conflict.dates.length > 1 ? 's' : ''}</span> :
            </p>
            <ul style={{ fontSize: 11, marginBottom: 4, marginLeft: 8, maxHeight: 112, overflowY: 'auto' }}>
              {conflict.dates.map(d => (
                <li key={d} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#a3c4c4' }}>{d}</span>
                  <span style={{ color: '#f59e0b' }}>{conflict.counts[d]} existant{conflict.counts[d] > 1 ? 's' : ''}</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, marginTop: 12 }}>
              {isExtended
                ? `${pendingRows.length} entrées sur ${[...new Set(pendingRows.map(r=>r.date))].length} dates à importer.`
                : `${conflict.rows.length} mots-clés à importer.`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => runImport(pendingRows, true)} style={{ padding: '12px 16px', borderRadius: 12, fontSize: 13, textAlign: 'left', cursor: 'pointer', background: C.primary, color: C.bg, border: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#2a6060')} onMouseLeave={e => (e.currentTarget.style.background = C.primary)}>
                <span style={{ fontWeight: 700 }}>Écraser</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.7, marginTop: 2 }}>Remplacer les positions existantes</span>
              </button>
              <button onClick={() => runImport(pendingRows, false)} style={{ padding: '12px 16px', borderRadius: 12, fontSize: 13, textAlign: 'left', cursor: 'pointer', background: C.surface, color: C.text, border: `1px solid ${C.border}` }}
                onMouseEnter={e => (e.currentTarget.style.background = C.border)} onMouseLeave={e => (e.currentTarget.style.background = C.surface)}>
                <span style={{ fontWeight: 700 }}>Ignorer les doublons</span>
                <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>Importer uniquement les nouvelles entrées</span>
              </button>
              <button onClick={() => { setConflict(null); setPendingRows([]) }} style={{ padding: '8px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: 'none', color: C.muted }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}