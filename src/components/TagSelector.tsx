import { useState, useRef, useEffect } from 'react'

interface Category {
  id: string
  name: string
  color: string
}

interface Props {
  categories: Category[]
  currentId?: string | null
  onSelect: (categoryId: string | null) => void
}

export function TagSelector({ categories, currentId, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = categories.find(c => c.id === currentId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
          border border-gray-700 hover:border-gray-500
          bg-gray-900 hover:bg-gray-800 transition-all"
      >
        {current ? (
          <>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: current.color }}
            />
            <span className="text-gray-200">{current.name}</span>
          </>
        ) : (
          <span className="text-gray-500">+ Tag</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-44
          bg-gray-900 border border-gray-700 rounded-lg shadow-xl
          overflow-hidden">

          {/* Option "Aucune catégorie" */}
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs
              text-gray-500 hover:bg-gray-800 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-gray-700" />
            Aucune
          </button>

          <div className="border-t border-gray-800" />

          {/* Catégories */}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { onSelect(cat.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs
                hover:bg-gray-800 transition-colors
                ${cat.id === currentId ? 'bg-gray-800' : ''}`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: cat.color }}
              />
              <span className="text-gray-200">{cat.name}</span>
              {cat.id === currentId && (
                <span className="ml-auto text-indigo-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}