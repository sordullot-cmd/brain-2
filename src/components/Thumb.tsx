import { useState } from 'react'
import { displaySrc, type Media } from '../lib/vault'

/**
 * Le visuel d'une tuile, partagé par la grille et les planches.
 *
 * Trois règles, toutes là pour que la page reste utilisable :
 *
 *  1. On affiche le **dérivé** (`thumb`), jamais l'original. Un PNG de 11 Mo en
 *     4010 × 8055 se décode en RAM à sa taille native même dans une tuile de
 *     168 px : cent tuiles suffisaient à figer l'onglet.
 *  2. Une vidéo n'est plus un `<video>` : c'est son **image d'affiche**. Le
 *     lecteur n'est monté qu'au survol, donc on ne télécharge les 22 Mo que si
 *     on les regarde vraiment.
 *  3. `width`/`height` sont posés depuis les dimensions du dérivé : le
 *     navigateur réserve la place et la grille ne saute pas pendant le
 *     chargement.
 */
export function Thumb({ m, className = '' }: { m: Media; className?: string }) {
  const [hover, setHover] = useState(false)
  const poster = displaySrc(m, 'thumb')

  if (m.kind === 'video') {
    return (
      <span
        className={`relative flex items-center justify-center ${className}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover ? (
          <video
            src={m.url}
            poster={m.thumb}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <>
            <img
              src={poster}
              alt={m.stem}
              width={m.dw}
              height={m.dh}
              loading="lazy"
              decoding="async"
              className="max-w-full max-h-full object-contain"
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/75 backdrop-blur-sm">
                <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                  <path d="M1 1.6a1 1 0 0 1 1.5-.87l8 5.4a1 1 0 0 1 0 1.74l-8 5.4A1 1 0 0 1 1 12.4z" />
                </svg>
              </span>
            </span>
          </>
        )}
      </span>
    )
  }

  return (
    <img
      src={poster}
      alt={m.stem}
      width={m.dw}
      height={m.dh}
      loading="lazy"
      decoding="async"
      className={className}
    />
  )
}
