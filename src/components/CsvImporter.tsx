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
  // Extract date from Period line OR from column header pattern _YYYYMMDD
  for (const line of lines) {
    const m = line.match(/Period:\s*(\d{8})\s*-\s*(\d{8})/)
    if (m) { const r = m[2]; date = r.slice(0,4)+'-'+r.slice(4,6)+'-'+r.slice(6,8); break }
  }
  const hi = lines.findIndex(l => l.trim().startsWith('Keyword'))
  if (hi === -1) throw new Error('En-tête "Keyword" introuvable')
  const headers = parseCSVLine(lines[hi])

  // --- Column detection (handles both classic and position-tracking-overview format) ---

  // Position col: col 1 by default, but check for dynamic PATTERN_DATE col
  let positionColIdx = 1

  // Tags
  const tagIdx = headers.findIndex(h => h === 'Tags')

  // Landing URL: try exact names first, then _DATE_landing pattern
  const landingIdx = (() => {
    const names = ['URL', 'Landing URL', 'Landing', 'url', 'landing url']
    for (const n of names) {
      const i = headers.findIndex(h => h === n); if (i >= 0) return i
    }
    return headers.findIndex(h => /_\d{8}_landing$/i.test(h))
  })()

  // Volume
  const volumeIdx = headers.findIndex(h => h === 'Volume' || h === 'Search Volume')

  // If col 1 is a dynamic PATTERN_DATE column, extract date from it
  const col1DateMatch = headers[1]?.match(/_(\d{8})$/)
  if (col1DateMatch && !headers[1]?.includes('_type') && !headers[1]?.includes('_landing')) {
    const raw = col1DateMatch[1]
    date = raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)
    positionColIdx = 1
  }

  console.log(`Colonnes — pos:${positionColIdx} Tags:${tagIdx} Landing:${landingIdx}(${headers[landingIdx]??'—'}) Volume:${volumeIdx}(${headers[volumeIdx]??'—'}) date:${date}`)

  const rows: ParsedRow[] = []
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue
    // Skip separator lines
    if (line.startsWith('-')) continue
    const cols = parseCSVLine(line)
    const keyword = cols[0]?.replace(/^"|"$/g, '').trim(); if (!keyword) continue
    // Skip lines that look like metadata (no valid position)
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
  console.log('📄 Standard:', rows.length, 'mots-clés · date:', date)
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

  // Collect all date columns by scanning ALL headers (not just from col 3)
  // A date col: has _YYYYMMDD as suffix, is not _type, not _landing, not _visibility, not _difference
  for (let c = 1; c < headers.length; c++) {
    const h = headers[c]
    if (!h) continue
    // Must contain a date pattern
    if (!/_\d{8}/.test(h)) continue
    // Skip suffix columns
    if (/_\d{8}_type$/i.test(h)) continue
    if (/_\d{8}_landing$/i.test(h)) continue
    if (/_\d{8}_visibility$/i.test(h)) continue
    if (h.endsWith('_difference')) continue
    if (h.endsWith('_visibility_difference')) continue
    // Must end with _YYYYMMDD (position column)
    const m = h.match(/_(\d{8})$/)
    if (!m) continue
    const raw = m[1]
    const date = raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)
    // Avoid duplicates
    if (dateCols.some(d => d.date === date)) continue
    const landingKey = `_${raw}_landing`
    const landingColIdx = headers.findIndex(hh => hh.endsWith(landingKey))
    dateCols.push({ date, colIdx: c, landingColIdx: landingColIdx >= 0 ? landingColIdx : null })
  }

  if (dateCols.length === 0) throw new Error('Aucune colonne de date dans l\'export étendu')
  console.log('📄 Étendu:', dateCols.length, 'dates:', dateCols.map(d => d.date))

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
  const uniqueDates = [...new Set(rows.map(r => r.date))].sort()
  console.log('✅', rows.length, 'entrées ·', uniqueDates.length, 'dates ·', new Set(rows.map(r=>r.keyword)).size, 'mots-clés')
  return rows
}

function detectAndParseCsv(text: string): { rows: ParsedRow[]; dates: string[]; isExtended: boolean } {
  const headerLine = text.replace(/\r\n/g,'\n').split('\n').find(l => l.trim().startsWith('Keyword')) ?? ''
  const headers = parseCSVLine(headerLine)

  // Count distinct dates in column headers — if >1, it's truly extended (multi-date)
  const dateDates = new Set<string>()
  for (const h of headers) {
    const m = h.match(/_(\d{8})/)
    if (m) dateDates.add(m[1])
  }
  const isExtended = dateDates.size > 1

  if (isExtended) {
    const rows = parseExtendedSemrushCsv(text)
    return { rows, dates: [...new Set(rows.map(r => r.date))].sort(), isExtended: true }
  } else {
    const { rows, date } = parseSemrushCsv(text)
    return { rows, dates: [date], isExtended: false }
  }
}

async function importRows(
  rows: ParsedRow[], projectId: string, overwrite: boolean,
  onProgress: (n: number) => void
): Promise<{ imported: number; skipped: number; errors: number; volumeUpdated: number; cannibalisations: number }> {
  let imported = 0, skipped = 0, errors = 0, volumeUpdated = 0, cannibalisations = 0
  const today = new Date().toISOString().split('T')[0]

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      // 1. Upsert keyword
      const { data: kw, error: kwErr } = await supabase
        .from('keywords').upsert({ keyword: row.keyword, project_id: projectId }, { onConflict: 'keyword,project_id' })
        .select('id').single()
      if (kwErr || !kw) { errors++; onProgress(i + 1); continue }

      // 2. Update volume
      if (row.volume != null) {
        const { error: ve } = await supabase.from('keywords').update({ volume: row.volume }).eq('id', kw.id)
        if (!ve) volumeUpdated++
      }

      // 3. Upsert URL
      let urlId: string | null = null
      if (row.url) {
        const { data: urlRow } = await supabase
          .from('urls').upsert({ url: row.url }, { onConflict: 'url' })
          .select('id').single()
        urlId = urlRow?.id ?? null
      }

      // 4. Tag
      if (row.tag) {
        const { data: cat } = await supabase.from('keyword_categories')
          .upsert({ name: row.tag, color: '#317979' }, { onConflict: 'name' }).select('id').single()
        if (cat) await supabase.from('keyword_tags').upsert({ keyword_id: kw.id, category_id: cat.id })
      }

      // 5. Get the most recent existing position for this keyword (to check current URL)
      const { data: currentPos } = await supabase.from('positions')
        .select('id, url_id, date')
        .eq('keyword_id', kw.id)
        .not('url_id', 'is', null)
        .order('date', { ascending: false })
        .limit(1)

      const currentUrlId = currentPos?.[0]?.url_id ?? null

      // 6. URL change detection
      if (urlId && currentUrlId && urlId !== currentUrlId) {
        // URL changed → record cannibalisation (upsert by keyword+date to avoid duplicates)
        await supabase.from('cannibalisation').upsert(
          { keyword_id: kw.id, old_url_id: currentUrlId, new_url_id: urlId, detected_at: today },
          { onConflict: 'keyword_id,detected_at' }
        )
        cannibalisations++
      }

      // 7. Check existing position for this specific date
      const { data: existing } = await supabase.from('positions')
        .select('id, url_id').eq('keyword_id', kw.id).eq('date', row.date).limit(1)

      if (existing?.length) {
        if (!overwrite) { skipped++; onProgress(i + 1); continue }
        // Update — always update url_id if we have a new one; if no new url, keep existing
        const updatePayload: any = { position: row.position, project_id: projectId }
        if (urlId) updatePayload.url_id = urlId
        await supabase.from('positions').update(updatePayload).eq('id', existing[0].id)
        imported++
      } else {
        // New position — always set url_id if we have one
        const { error: pe } = await supabase.from('positions').insert(
          { keyword_id: kw.id, url_id: urlId, position: row.position, date: row.date, project_id: projectId }
        )
        if (pe) { errors++ } else { imported++ }

        // If this is a new position and we now have an url but the keyword had no url before,
        // also patch the most recent existing position if its url_id is null
        if (urlId && currentPos?.length && !currentPos[0].url_id) {
          await supabase.from('positions')
            .update({ url_id: urlId })
            .eq('id', currentPos[0].id)
        }
      }
    } catch { errors++ }
    onProgress(i + 1)
  }
  return { imported, skipped, errors, volumeUpdated, cannibalisations }
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    setStatus('parsing'); setMessage('Lecture du fichier…'); setConflict(null); setProgress(0)
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
    } catch (err: any) { setStatus('error'); setMessage(`Erreur : ${err.message}`); console.error(err) }
  }

  async function runImport(rows: ParsedRow[], overwrite: boolean) {
    setStatus('importing'); setConflict(null); setProgress(0); setTotal(rows.length)
    setMessage(`Import de ${rows.length} entrées…`)
    const result = await importRows(rows, projectId ?? '00000000-0000-0000-0000-000000000001', overwrite, (n) => {
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
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
        style={status === 'importing'
          ? {background:'#0d1f1f', color:'#2a5050', cursor:'not-allowed'}
          : {background:'#317979', color:'#071212'}}>
        <span>↑</span>
        {status === 'importing' ? `${progress}/${total}` : 'Importer CSV'}
        <input type="file" accept=".csv" onChange={handleFile} disabled={status === 'importing'} className="hidden" />
      </label>

      {/* Format badge — shown after parsing */}
      {(status === 'checking' || status === 'importing' || status === 'done') && (
        <span className="text-[9px] px-2 py-0.5 rounded border font-semibold"
          style={isExtended
            ? {background:'#1a2a3a', border:'1px solid #317979', color:'#a3f1eb'}
            : {background:'#1a2a1a', border:'1px solid #2a5050', color:'#4a7a7a'}}>
          {isExtended ? '⊞ Multi-dates' : '⊟ Standard'}
        </span>
      )}

      {message && !conflict && (
        <span className="text-xs" style={{
          color: status === 'done' ? '#4ade80' : status === 'error' ? '#f87171' : '#4a7a7a'
        }}>
          {message}
        </span>
      )}

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{background:'#0d1f1f', border:'1px solid #1a3535'}}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-semibold" style={{color:'#f6f6f6'}}>Données existantes détectées</h2>
              <span className="text-[9px] px-2 py-0.5 rounded border font-semibold"
                style={isExtended
                  ? {background:'#1a2a3a', border:'1px solid #317979', color:'#a3f1eb'}
                  : {background:'#1a2a1a', border:'1px solid #2a5050', color:'#4a7a7a'}}>
                {isExtended ? '⊞ Multi-dates' : '⊟ Standard'}
              </span>
            </div>
            <p className="text-sm mb-2" style={{color:'#4a7a7a'}}>
              Des positions existent déjà pour{' '}
              <span className="font-medium" style={{color:'#f59e0b'}}>{conflict.dates.length} date{conflict.dates.length > 1 ? 's' : ''}</span> :
            </p>
            <ul className="text-xs mb-1 ml-2 max-h-28 overflow-y-auto space-y-0.5">
              {conflict.dates.map(d => (
                <li key={d} className="flex justify-between">
                  <span style={{color:'#a3c4c4'}}>{d}</span>
                  <span style={{color:'#f59e0b'}}>{conflict.counts[d]} existant{conflict.counts[d] > 1 ? 's' : ''}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm mb-5 mt-3" style={{color:'#4a7a7a'}}>
              {isExtended
                ? `${pendingRows.length} entrées sur ${[...new Set(pendingRows.map(r=>r.date))].length} dates à importer.`
                : `${conflict.rows.length} mots-clés à importer.`}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => runImport(pendingRows, true)}
                className="w-full px-4 py-3 rounded-xl text-sm text-left transition-colors"
                style={{background:'#317979', color:'#071212'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#2a6060')}
                onMouseLeave={e=>(e.currentTarget.style.background='#317979')}>
                <span className="font-medium">Écraser</span>
                <span className="block text-xs mt-0.5" style={{color:'#071212', opacity:0.7}}>Remplacer les positions existantes</span>
              </button>
              <button onClick={() => runImport(pendingRows, false)}
                className="w-full px-4 py-3 rounded-xl text-sm text-left transition-colors"
                style={{background:'#0d1f1f', border:'1px solid #1a3535', color:'#f6f6f6'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#1a3535')}
                onMouseLeave={e=>(e.currentTarget.style.background='#0d1f1f')}>
                <span className="font-medium">Ignorer les doublons</span>
                <span className="block text-xs mt-0.5" style={{color:'#4a7a7a'}}>Importer uniquement les nouvelles entrées</span>
              </button>
              <button onClick={() => { setConflict(null); setPendingRows([]) }}
                className="w-full px-4 py-2 text-sm transition-colors"
                style={{color:'#4a7a7a'}}
                onMouseEnter={e=>(e.currentTarget.style.color='#f6f6f6')}
                onMouseLeave={e=>(e.currentTarget.style.color='#4a7a7a')}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}