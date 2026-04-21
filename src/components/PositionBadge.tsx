interface Props {
  position: number | null
}

export function PositionBadge({ position }: Props) {
  if (position === null) {
    return <span className="text-gray-600 font-mono">—</span>
  }

  const color =
    position <= 3  ? 'text-emerald-400' :
    position <= 10 ? 'text-blue-400'    :
    position <= 30 ? 'text-yellow-400'  :
                     'text-gray-400'

  return (
    <span className={`font-mono font-semibold ${color}`}>
      #{position}
    </span>
  )
}