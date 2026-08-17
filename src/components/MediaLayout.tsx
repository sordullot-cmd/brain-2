import { useMemo, useState } from 'react'
import type { Media } from '../lib/vault'
import { layoutMedia, mediaRatio, previewRows, type Row } from '../lib/layout'
import { useLightbox } from './Lightbox'

/**
 * Rend les visuels d'un aspect en suivant la composition calculee par
 * `layoutMedia` : visuel de signature en pleine largeur, quadrillages pour les
 * series, rangees justifiees pour le reste.
 */
export function MediaLayout({ items, preview }: { items: Media[]; preview?: number }) {
  const rows = useMemo(() => layoutMedia(items), [items])
  const [all, setAll] = useState(false)

  /** Rangees montrees d'emblee : on coupe entre deux rangees, jamais au milieu. */
  const shownCount = useMemo(() => (preview ? previewRows(rows, preview) : rows.length), [rows, preview])
  const visibleRows = all ? rows : rows.slice(0, shownCount)
  const rest = items.length - visibleRows.reduce((t, r) => t + r.items.length, 0)

  // La visionneuse suit l'ordre affiche, pas l'ordre du dossier.
  const flat = useMemo(() => visibleRows.flatMap((r) => r.items), [visibleRows])
  const { openAt, node } = useLightbox(flat)

  if (!items.length) return <p className="caption text-subtle">aucun visuel</p>

  let offset = 0
  const truncated = shownCount < rows.length

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {visibleRows.map((row, i) => {
          const start = offset
          offset += row.items.length
          return <RowView key={i} row={row} start={start} onOpen={openAt} />
        })}
      </div>

      {truncated && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setAll((v) => !v)}
            className="label rounded-lg border border-border bg-background px-4 py-2.5 transition-colors hover:border-brand/40"
          >
            {all ? 'Réduire' : `Voir les ${rest} visuels suivants`}
          </button>
        </div>
      )}

      {node}
    </>
  )
}

function RowView({ row, start, onOpen }: { row: Row; start: number; onOpen: (i: number) => void }) {
  if (row.kind === 'feature') {
    const m = row.items[0]
    return (
      <Tile
        m={m}
        onClick={() => onOpen(start)}
        className="h-[240px] sm:h-[340px] w-full"
        pad
      />
    )
  }

  if (row.kind === 'grid') {
    return (
      <div
        className="grid gap-3 sm:gap-4"
        style={{ gridTemplateColumns: `repeat(${row.cols}, minmax(0, 1fr))` }}
      >
        {row.items.map((m, k) => (
          <Tile key={m.id} m={m} onClick={() => onOpen(start + k)} style={{ aspectRatio: mediaRatio(m) }} />
        ))}
      </div>
    )
  }

  // Une rangee trop « etroite » (un seul portrait, par exemple) ne doit pas etre
  // etiree sur toute la largeur : on lui donne une hauteur fixe et on cale a gauche.
  if (row.sum < 1.7) {
    const H = 300
    return (
      <div className="flex gap-3 sm:gap-4" style={{ height: H }}>
        {row.items.map((m, k) => (
          <Tile
            key={m.id}
            m={m}
            onClick={() => onOpen(start + k)}
            className="h-full"
            style={{ width: mediaRatio(m) * H, flexShrink: 1, minWidth: 0 }}
          />
        ))}
      </div>
    )
  }

  // Rangee justifiee : la rangee porte le format cumule, chaque visuel prend sa
  // part de largeur — les hauteurs s'alignent toutes seules. Les coefficients
  // sont normalises : en dessous de 1 au total, flex-grow ne distribue pas tout.
  return (
    <div className="flex gap-3 sm:gap-4" style={{ aspectRatio: row.sum, maxHeight: 420 }}>
      {row.items.map((m, k) => (
        <Tile
          key={m.id}
          m={m}
          onClick={() => onOpen(start + k)}
          className="h-full min-w-0"
          style={{ flexGrow: mediaRatio(m) / row.sum, flexShrink: 1, flexBasis: 0 }}
        />
      ))}
    </div>
  )
}

/**
 * Un visuel. Les SVG sont poses en retrait sur fond blanc (ce sont des logos) ;
 * les images matricielles remplissent leur case, qui est deja a leur format.
 */
function Tile({
  m,
  onClick,
  className = '',
  style,
  pad,
}: {
  m: Media
  onClick: () => void
  className?: string
  style?: React.CSSProperties
  pad?: boolean
}) {
  const padded = pad || m.ext === 'svg'

  return (
    <button
      onClick={onClick}
      style={style}
      className={`group relative block overflow-hidden rounded-lg border border-border bg-background transition-all hover:border-brand/35 hover:shadow-[0_8px_28px_-14px_rgba(0,8,46,0.45)] ${className}`}
      aria-label={`Ouvrir ${m.name}`}
    >
      <span
        className={`flex h-full w-full items-center justify-center ${
          pad ? 'p-6 sm:p-10' : padded ? 'p-2 sm:p-3' : ''
        }`}
      >
        {m.kind === 'video' ? (
          <video
            src={m.url}
            muted
            loop
            playsInline
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <img src={m.url} alt={m.stem} loading="lazy" className="h-full w-full object-contain" />
        )}
      </span>

      {/* Le nom du fichier ne s'affiche qu'au survol : la planche reste lisible. */}
      <span className="caption pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background via-background/90 to-transparent px-3 pb-2.5 pt-6 text-left text-subtle opacity-0 transition-opacity group-hover:opacity-100">
        {m.stem.replace(/[-_]/g, ' ')}
      </span>
    </button>
  )
}
