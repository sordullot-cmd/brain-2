import { useCallback, useEffect, useState } from 'react'
import type { Media } from '../lib/vault'
import { fmtBytes, displaySrc } from '../lib/vault'

/**
 * Visionneuse plein ecran, partagee par la grille simple et la composition.
 * `useLightbox` gere l'index ouvert, les fleches et la touche Echap.
 */
export function useLightbox(items: Media[]) {
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

  const node =
    open !== null && items[open] ? (
      <Lightbox item={items[open]} index={open} total={items.length} onClose={close} onMove={move} />
    ) : null

  return { openAt: setOpen, node }
}

export function Lightbox({
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
          {item.ext.toUpperCase()} · {item.w && item.h ? `${item.w}×${item.h} · ` : ''}
          {fmtBytes(item.size)}
        </span>
        {item.view && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="caption text-subtle hover:text-foreground transition-colors shrink-0 ml-auto"
            title={`Ouvrir le fichier d'origine (${fmtBytes(item.size)})`}
          >
            original ↗
          </a>
        )}
        <span className={`caption text-subtle mono shrink-0 ${item.view ? '' : 'ml-auto'}`}>
          {index + 1} / {total}
        </span>
        <button
          onClick={onClose}
          className="label px-3 py-2 rounded-full hover:bg-surface transition-colors shrink-0"
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
            <video
              src={item.url}
              poster={item.thumb}
              controls
              autoPlay
              loop
              preload="metadata"
              className="max-w-full max-h-full rounded-lg"
            />
          ) : (
            /* Le dérivé « view » suffit à l'écran ; l'original reste à un clic,
               via le lien de l'en-tête. */
            <img
              src={displaySrc(item, 'view')}
              alt={item.stem}
              className="max-w-full max-h-full object-contain"
            />
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
