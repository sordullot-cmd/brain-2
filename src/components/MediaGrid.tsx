import { useCallback, useEffect, useState } from 'react'
import type { Media } from '../lib/vault'
import { fmtBytes } from '../lib/vault'

/**
 * Grille de médias + visionneuse plein écran.
 * Les SVG et PNG transparents sont posés sur un damier discret pour rester lisibles.
 */
export function MediaGrid({ items, cols = 'auto' }: { items: Media[]; cols?: 'auto' | 'wide' }) {
  const [open, setOpen] = useState<number | null>(null)

  const close = useCallback(() => setOpen(null), [])
  const move = useCallback(
    (d: number) => setOpen((i) => (i === null ? null : (i + d + items.length) % items.length)),
    [items.length]
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close, move])

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
            onClick={() => setOpen(i)}
            className="group text-left"
            aria-label={`Ouvrir ${m.name}`}
          >
            <div className="checker aspect-square rounded-xl border border-border overflow-hidden flex items-center justify-center p-3 transition-all group-hover:border-brand/35 group-hover:shadow-[0_6px_24px_-12px_rgba(0,8,46,0.35)]">
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
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <img
                  src={m.url}
                  alt={m.stem}
                  loading="lazy"
                  className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                />
              )}
            </div>
            <p className="caption mt-2 truncate text-subtle group-hover:text-foreground transition-colors">
              {m.stem.replace(/[-_]/g, ' ')}
            </p>
          </button>
        ))}
      </div>

      {open !== null && items[open] && (
        <Lightbox item={items[open]} index={open} total={items.length} onClose={close} onMove={move} />
      )}
    </>
  )
}

function Lightbox({
  item,
  index,
  total,
  onClose,
  onMove,
}: {
  item: Media
  index: number
  total: number
  onClose: () => void
  onMove: (d: number) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-white/97 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div className="flex items-center gap-4 px-5 sm:px-8 h-16 border-b border-border shrink-0">
        <span className="label truncate">{item.stem.replace(/[-_]/g, ' ')}</span>
        <span className="caption text-subtle mono shrink-0">
          {item.ext.toUpperCase()} · {fmtBytes(item.size)}
        </span>
        <span className="caption text-subtle mono ml-auto shrink-0">
          {index + 1} / {total}
        </span>
        <button
          onClick={onClose}
          className="label px-3 py-2 rounded-lg hover:bg-surface transition-colors shrink-0"
          aria-label="Fermer"
        >
          Fermer
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center gap-2 px-2 sm:px-6 py-6">
        <button
          onClick={() => onMove(-1)}
          className="h-12 w-12 rounded-full hover:bg-surface transition-colors flex items-center justify-center shrink-0"
          aria-label="Précédent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="checker flex-1 h-full rounded-2xl border border-border flex items-center justify-center p-4 sm:p-10 min-w-0">
          {item.kind === 'video' ? (
            <video src={item.url} controls autoPlay loop className="max-w-full max-h-full rounded-lg" />
          ) : (
            <img src={item.url} alt={item.stem} className="max-w-full max-h-full object-contain" />
          )}
        </div>

        <button
          onClick={() => onMove(1)}
          className="h-12 w-12 rounded-full hover:bg-surface transition-colors flex items-center justify-center shrink-0"
          aria-label="Suivant"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="px-5 sm:px-8 pb-5 shrink-0">
        <p className="caption text-subtle mono truncate">{item.path}</p>
      </div>
    </div>
  )
}
