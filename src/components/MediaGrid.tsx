import type { Media } from '../lib/vault'
import { useLightbox } from './Lightbox'
import { Thumb } from './Thumb'

/**
 * Grille de médias + visionneuse plein écran.
 * Les SVG et PNG transparents sont posés sur un damier discret pour rester lisibles.
 */
export function MediaGrid({
  items,
  cols = 'auto',
  tile = 'plain',
}: {
  items: Media[]
  cols?: 'auto' | 'wide'
  /** `card` : fond blanc, pour poser la grille sur un carton gris (SpecCanvas). */
  tile?: 'plain' | 'card'
}) {
  const { openAt, node } = useLightbox(items)

  if (!items.length) return null

  const grid =
    cols === 'wide'
      ? 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
      : 'grid-cols-[repeat(auto-fill,minmax(168px,1fr))]'

  return (
    <>
      <div className={`grid ${grid} gap-3`}>
        {items.map((m, i) => (
          <button
            key={m.id}
            onClick={() => openAt(i)}
            className="group text-left"
            aria-label={`Ouvrir ${m.name}`}
          >
            <div
              className={`aspect-square rounded-xl border border-border overflow-hidden flex items-center justify-center transition-all group-hover:border-brand/35 group-hover:shadow-[0_6px_24px_-12px_rgba(0,8,46,0.35)] ${
                tile === 'card' ? 'bg-background p-4' : 'checker p-3'
              }`}
            >
              <Thumb
                m={m}
                className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
              />
            </div>
            <p className="caption mt-2 truncate text-subtle group-hover:text-foreground transition-colors">
              {m.stem.replace(/[-_]/g, ' ')}
            </p>
          </button>
        ))}
      </div>

      {node}
    </>
  )
}
