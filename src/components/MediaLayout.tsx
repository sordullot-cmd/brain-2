import { useMemo, useState } from 'react'
import { Thumb } from './Thumb'
import type { Media } from '../lib/vault'
import { layoutMedia, previewRows, type Row } from '../lib/layout'
import { useLightbox } from './Lightbox'

/**
 * Rend les visuels d'un aspect en suivant la composition calculee par
 * `layoutMedia` : chaque ligne remplit toute la largeur, et ses cellules sont
 * identiques — donc de meme hauteur. La variation est entre les lignes.
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
            className="label rounded-full border border-border bg-background px-4 py-2.5 transition-colors hover:border-brand/40"
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

  // Une ligne de cellules identiques, qui remplit toute la largeur : le format
  // vient de la LIGNE, pas de chaque visuel — sinon les hauteurs divergent sur
  // une meme ligne. Chaque visuel est centre et contenu dans sa cellule.
  return (
    <div
      className="grid gap-3 sm:gap-4"
      style={{ gridTemplateColumns: `repeat(${row.cols}, minmax(0, 1fr))` }}
    >
      {row.items.map((m, k) => (
        <Tile key={m.id} m={m} onClick={() => onOpen(start + k)} style={{ aspectRatio: row.ratio }} />
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
        <Thumb m={m} sizes="(max-width: 640px) 90vw, 420px" className="h-full w-full object-contain" />
      </span>

      {/* Le nom du fichier ne s'affiche qu'au survol : la planche reste lisible. */}
      <span className="caption pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background via-background/90 to-transparent px-3 pb-2.5 pt-6 text-left text-subtle opacity-0 transition-opacity group-hover:opacity-100">
        {m.stem.replace(/[-_]/g, ' ')}
      </span>
    </button>
  )
}
