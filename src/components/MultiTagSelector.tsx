import { useState, useRef, useEffect } from 'react'

export interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  tags: Tag[]          // tags actuellement assignés
  categories: Tag[]    // tous les tags disponibles
  onAdd: (categoryId: string) => void
  onRemove: (categoryId: string) => void
  onCreate: (name: string, color: string) => void
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#14b8a6',
]

export function MultiTagSelector({ tags, categories, onAdd, onRemove, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const assignedIds = new Set(tags.map(t => t.id))

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const canCreate = search.trim().length > 0 &&
    !categories.find(c => c.name.toLowerCase() === search.trim().toLowerCase())

  function handleCreate() {
    if (!search.trim()) return
    onCreate(search.trim(), newColor)
    setSearch('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative flex items-center gap-1 flex-wrap">

      {/* Tags assignés */}
      {tags.map(tag => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
            text-xs font-medium cursor-default group"
          style={{ background: tag.color + '22', color: tag.color }}
        >
          {tag.name}
          <button
            onClick={() => onRemove(tag.id)}
            className="opacity-0 group-hover:opacity-100 hover:opacity-100
              transition-opacity ml-0.5 text-xs leading-none"
            style={{ color: tag.color }}
          >
            ×
          </button>
        </span>
      ))}

      {/* Bouton + */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-5 h-5 rounded-full border border-dashed border-gray-600
          text-gray-600 hover:border-indigo-500 hover:text-indigo-400
          transition-colors flex items-center justify-center text-xs"
      >
        +
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-52
          bg-gray-900 border border-gray-700 rounded-lg shadow-xl
          overflow-hidden"
          style={{ minWidth: '200px' }}
        >
          {/* Recherche / création */}
          <div className="p-2 border-b border-gray-800">
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher ou créer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate() }}
              className="w-full bg-gray-800 border border-gray-700 rounded-md
                px-2 py-1 text-xs text-gray-200 placeholder-gray-600
                focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Liste des catégories existantes */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-2 text-xs text-gray-600">Aucun tag trouvé</p>
            )}
            {filtered.map(cat => {
              const assigned = assignedIds.has(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => assigned ? onRemove(cat.id) : onAdd(cat.id)}
                  className="w-full flex items-center gap-2 px-3 py-2
                    hover:bg-gray-800 transition-colors text-left"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: cat.color }}
                  />
                  <span className="text-xs text-gray-200 flex-1">{cat.name}</span>
                  {assigned && <span className="text-indigo-400 text-xs">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Créer un nouveau tag */}
          {canCreate && (
            <div className="border-t border-gray-800 p-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">Couleur :</span>
                <div className="flex gap-1 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="w-4 h-4 rounded-full transition-transform
                        hover:scale-110"
                      style={{
                        background: c,
                        outline: newColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-2 py-1.5
                  bg-indigo-600 hover:bg-indigo-500 rounded-md
                  transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: newColor }}
                />
                <span className="text-xs text-white">
                  Créer "{search.trim()}"
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}