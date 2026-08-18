import { useState } from 'react'
import { playSrc, tileSrcSet, type Media } from '../lib/vault'

/**
 * Le visuel d'une tuile, partagé par la grille et les planches.
 *
 * Quatre règles, toutes là pour que la page reste utilisable :
 *
 *  1. On affiche le **dérivé**, jamais l'original. Un PNG de 11 Mo en
 *     4010 × 8055 se décode en RAM à sa taille native même dans une tuile de
 *     168 px : cent tuiles suffisaient à figer l'onglet.
 *  2. Le dérivé vient en `srcset` : une tuile de 168 px prend `mini` (400 px),
 *     un écran retina ou une tuile large prend `thumb` (640 px). C'est le
 *     navigateur qui tranche, avec le bon poids à chaque fois.
 *  3. Une vidéo n'est pas un `<video>` : c'est son **image d'affiche**. Le
 *     lecteur n'est monté qu'au survol, et il lit le `preview` recompressé
 *     (~1 Mo), jamais le master de 21 Mo.
 *  4. `width`/`height` sont posés depuis les dimensions du dérivé : le
 *     navigateur réserve la place et la grille ne saute pas pendant le
 *     chargement.
 */
export function Thumb({
  m,
  className = '',
  sizes,
}: {
  m: Media
  className?: string
  /** Largeur d'affichage de la tuile, pour que `srcset` choisisse juste. */
  sizes?: string
}) {
  const [hover, setHover] = useState(false)
  const img = tileSrcSet(m, sizes)

  if (m.kind === 'video') {
    return (
      <span
        className={`relative flex items-center justify-center ${className}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover ? (
          <video
            src={playSrc(m)}
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
              src={img.src}
              srcSet={img.srcSet}
              sizes={img.sizes}
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
      src={img.src}
      srcSet={img.srcSet}
      sizes={img.sizes}
      alt={m.stem}
      width={m.dw}
      height={m.dh}
      loading="lazy"
      decoding="async"
      className={className}
    />
  )
}
