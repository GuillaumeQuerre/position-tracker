import { useState } from 'react'

export interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  categories: Tag[]
  onApply: (pattern: string, categoryId: string) => Promise<number>
  placeholder?: string
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#14b8a6',
]

export function RegexTagger({ categories, onApply, placeholder }: Props) {
  const [pattern, setPattern] = useState('')
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(COLORS[0])
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isValid, setIsValid] = useState(true)

  function validatePattern(p: string) {
    try { new RegExp(p); setIsValid(true) }
    catch { setIsValid(false) }
  }

  async function handleApply() {
    if (!pattern.trim() || !isValid) return

    const catId = mode === 'existing' ? selectedCatId : ''
    if (mode === 'existing' && !catId) {
      setMessage('Sélectionne un tag')
      return
    }
    if (mode === 'new' && !newTagName.trim()) {
      setMessage('Entre un nom de tag')
      return
    }

    setStatus('running')
    setMessage('')

    try {
      let finalCatId = catId

      // Créer le nouveau tag si besoin
      if (mode === 'new') {
        const { supabase } = await import('../lib/supabase')
        const tableName = placeholder?.includes('URL') ? 'url_categories' : 'keyword_categories'
        const { data: cat, error } = await supabase
          .from(tableName)
          .upsert({ name: newTagName.trim(), color: newTagColor }, { onConflict: 'name' })
          .select('id')
          .single()
        if (error || !cat) throw new Error('Impossible de créer le tag')
        finalCatId = cat.id
      }

      const count = await onApply(pattern.trim(), finalCatId)
      setStatus('done')
      setMessage(`✓ ${count} élément${count > 1 ? 's' : ''} tagué${count > 1 ? 's' : ''}`)
      setPattern('')
    } catch (e: any) {
      setStatus('error')
      setMessage(`Erreur : ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-900 border border-gray-800
      rounded-xl">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Regex →</span>

        {/* Champ regex */}
        <div className="relative flex-1">
          <input
            type="text"
            value={pattern}
            onChange={e => { setPattern(e.target.value); validatePattern(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
            placeholder={placeholder ?? 'Ex: running|trail|marathon'}
            className={`w-full bg-gray-800 border rounded-lg px-3 py-1.5
              text-xs font-mono text-gray-200 placeholder-gray-600
              focus:outline-none transition-colors
              ${!isValid && pattern
                ? 'border-red-600 focus:border-red-500'
                : 'border-gray-700 focus:border-indigo-500'}`}
          />
          {!isValid && pattern && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2
              text-red-400 text-xs">
              regex invalide
            </span>
          )}
        </div>

        {/* Toggle existing / new */}
        <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {(['existing', 'new'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-md text-xs transition-all
                ${mode === m
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              {m === 'existing' ? 'Tag existant' : 'Nouveau tag'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Sélection tag existant */}
        {mode === 'existing' && (
          <select
            value={selectedCatId}
            onChange={e => setSelectedCatId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg
              px-2 py-1.5 text-xs text-gray-300
              focus:outline-none focus:border-indigo-500"
          >
            <option value="">— Choisir un tag —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Création nouveau tag */}
        {mode === 'new' && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="Nom du tag…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg
                px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600
                focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: newTagColor === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bouton appliquer */}
        <button
          onClick={handleApply}
          disabled={!pattern.trim() || !isValid || status === 'running'}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500
            disabled:bg-gray-800 disabled:text-gray-600
            text-white text-xs rounded-lg transition-colors font-medium"
        >
          {status === 'running' ? '…' : 'Appliquer'}
        </button>

        {/* Message statut */}
        {message && (
          <span className={`text-xs ${
            status === 'done'  ? 'text-emerald-400' :
            status === 'error' ? 'text-red-400'     :
                                 'text-gray-500'
          }`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}