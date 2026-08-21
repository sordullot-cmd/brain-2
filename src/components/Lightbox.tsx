import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Media } from '../lib/vault'
import { fmtBytes, displaySrc, playSrc, viewPixels, trancheH } from '../lib/vault'
import { LoupeControls, useLoupe } from './Loupe'

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

/**
 * Zone reellement offerte au visuel : l'ecran moins l'en-tete (64), le pied de
 * page (~44), les marges verticales (32) et les deux fleches sur les cotes.
 * Elle sert a decider du mode d'affichage, pas a poser des tailles : le rendu
 * reste en pourcentages, donc une estimation a quelques pixels pres suffit.
 */
function zoneEcran() {
  const large = window.innerWidth >= 640
  return {
    w: Math.max(160, window.innerWidth - (large ? 32 : 16) - 112),
    h: Math.max(160, window.innerHeight - 64 - 44 - 32),
  }
}

function useZone() {
  const [zone, setZone] = useState(zoneEcran)
  useEffect(() => {
    const onResize = () => setZone(zoneEcran())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return zone
}

/**
 * Comment montrer un visuel.
 *
 * `contain` — tout le visuel dans la zone — est le bon mode pour les formats
 * courants, ecrans de telephone compris : une capture 1125x2436 posee sur la
 * hauteur fait 390 px de large, soit la taille du telephone d'origine, et se
 * lit tres bien.
 *
 * Ce qui ne se lit plus, c'est le format EXTREME : une page marketing exportee
 * d'un seul tenant (1170x41016, 35 fois plus haute que large) contenue dans la
 * hauteur tombe a 25 px de large. On cesse alors de tout faire tenir : le
 * visuel prend la dimension qui le rend lisible — sa largeur s'il est haut, sa
 * hauteur si c'est une bande — et on defile dans l'autre.
 */
export type Mode = 'contain' | 'scroll-y' | 'scroll-x'

/** Au-dela de ce rapport (3 fois plus haut que large, ou l'inverse), contenir n'a plus de sens. */
const FORMAT_EXTREME = 3
/**
 * Reduction en dessous de laquelle le contenu n'est plus lisible. Un visuel tres
 * haut mais petit tient deja a sa taille reelle : c'est la REDUCTION qui gene,
 * pas le format, et il n'y a rien a defiler.
 */
const NET_MIN = 0.5

function modeAffichage(m: Media, zone: { w: number; h: number }): Mode {
  // Un visuel decoupe en tranches n'a de sens qu'empile : c'est deja le constat
  // fait a l'indexation, on ne le refait pas ici.
  if (m.bande?.length) return 'scroll-y'
  const px = viewPixels(m)
  if (!px || m.kind === 'video') return 'contain'
  const r = px.w / px.h
  if (r > 1 / FORMAT_EXTREME && r < FORMAT_EXTREME) return 'contain'
  if (Math.min(zone.w / px.w, zone.h / px.h) >= NET_MIN) return 'contain'
  return r < 1 ? 'scroll-y' : 'scroll-x'
}

/**
 * Combien de place un visuel a le droit de prendre dans la visionneuse.
 *
 * Remplir l'ecran est le bon reglage pour la grande majorite des visuels, mais
 * deux cas se voient tout de suite, et ce sont eux qu'on borne :
 *
 *   1. **un bitmap plus petit que l'ecran** : etire, il n'apporte aucun detail,
 *      il ne fait que grossir ses pixels. On ne depasse donc pas ZOOM_MAX fois
 *      les pixels REELLEMENT presents dans le fichier affiche (le derive `view`,
 *      plafonne a 1800 px, ou l'original). Un SVG servi tel quel est vectoriel :
 *      il est net a n'importe quelle taille, aucune limite ne s'applique.
 *   2. **un visuel carre** — le format des logos : bord a bord il colle a
 *      l'en-tete et aux fleches. Il s'arrete a CARRE_MAX de la zone, ce qui lui
 *      rend la marge qu'un logo demande.
 */
const ZOOM_MAX = 2
const CARRE_MAX = '80%'
/**
 * Largeur de LECTURE d'un visuel qui defile. Une page exportee d'un seul tenant
 * l'a ete en 2x ou 3x : posee sur toute la largeur de l'ecran, elle est deux
 * fois plus grande que la page d'origine — on lit un titre par ecran. A cette
 * largeur elle se lit comme la page, un peu agrandie, et il reste de la marge
 * autour.
 */
const LECTURE_MAX = 700
const estCarre = (r: number) => r > 0.85 && r < 1.18

/**
 * `echelle` est le facteur de la loupe. En mode contenu, la loupe transforme le
 * visuel elle-meme et l'echelle ne touche pas a ces bornes — elles decrivent la
 * taille de DEPART. En defilement il n'y a rien a transformer : l'echelle
 * multiplie la dimension qui conduit le visuel, et le navigateur defile plus
 * loin.
 */
function limites(m: Media, mode: Mode, echelle = 1): CSSProperties | undefined {
  const px = viewPixels(m)
  // Un SVG passe tel quel quand il est leger ; au-dela il est rasterise en
  // `view`, et redevient donc un bitmap a menager.
  const vectoriel = m.ext === 'svg' && !m.view
  const zoom = vectoriel || !px ? null : { w: px.w * ZOOM_MAX, h: px.h * ZOOM_MAX }

  // En defilement, une seule dimension conduit le visuel : c'est la seule a
  // borner. L'autre suit le format, aussi loin qu'il faut.
  if (mode === 'scroll-y')
    return {
      width: `${echelle * 100}%`,
      maxWidth: `${Math.min(zoom?.w ?? LECTURE_MAX, LECTURE_MAX) * echelle}px`,
    }
  if (mode === 'scroll-x')
    return { height: `${echelle * 100}%`, maxHeight: zoom ? `${zoom.h * echelle}px` : undefined }

  const carre = estCarre(px ? px.w / px.h : 1)
  if (!carre) return zoom ? { maxWidth: `${zoom.w}px`, maxHeight: `${zoom.h}px` } : undefined
  return zoom
    ? { maxWidth: `min(${CARRE_MAX}, ${zoom.w}px)`, maxHeight: `min(${CARRE_MAX}, ${zoom.h}px)` }
    : { maxWidth: CARRE_MAX, maxHeight: CARRE_MAX }
}

/**
 * Zoomer dans le derive `view` (1800 px au plus) finit par montrer les pixels du
 * derive, pas ceux du visuel. Passe ce facteur, la visionneuse va donc chercher
 * l'ORIGINAL, une fois, en tache de fond — et seulement s'il reste raisonnable a
 * charger : au-dela, le lien « original » de l'en-tete reste la.
 */
const HD_DES = 1.6
const HD_POIDS_MAX = 30 * 1024 * 1024
const peutHD = (m: Media) => !!m.view && m.kind === 'image' && !m.bande?.length && m.size <= HD_POIDS_MAX

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
  const zone = useZone()
  const mode = useMemo(() => modeAffichage(item, zone), [item, zone])

  // La loupe : molette, pincement, double-clic, glisser. En mode contenu elle
  // transforme le visuel elle-meme ; en defilement elle n'agit que sur l'echelle
  // et laisse le navigateur defiler.
  const loupe = useLoupe({ cle: item.id, deplacable: mode === 'contain', actif: item.kind !== 'video' })

  // Zoome assez loin, le derive `view` montre ses propres pixels : on charge
  // alors l'original en tache de fond et on l'echange une fois pret, sans faire
  // sauter l'affichage (meme boite, meme format).
  const [hd, setHd] = useState<'non' | 'charge' | 'oui'>('non')
  useEffect(() => setHd('non'), [item.id])
  useEffect(() => {
    if (hd === 'non' && loupe.echelle >= HD_DES && peutHD(item)) setHd('charge')
  }, [hd, loupe.echelle, item])
  useEffect(() => {
    if (hd !== 'charge') return
    let vivant = true
    const image = new Image()
    image.onload = () => vivant && setHd('oui')
    image.onerror = () => vivant && setHd('non')
    image.src = item.url
    return () => {
      vivant = false
    }
  }, [hd, item.url])

  // Repartir en haut du visuel a chaque changement d'image : on lit une capture
  // a rallonge depuis son debut, pas depuis la position de la precedente.
  const [defilant, setDefilant] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!defilant) return
    defilant.scrollTo(0, 0)
    // Sans le focus, les fleches haut/bas et Page suivante ne defilent pas :
    // le clavier parlerait a la page, qui elle ne bouge pas.
    if (mode !== 'contain') defilant.focus({ preventScroll: true })
  }, [defilant, item, mode])

  /* Le derive « view » suffit a l'ecran ; l'original arrive quand on zoome
     dedans, et reste sinon a un clic via le lien de l'en-tete. */
  const visuel = (
    <img
      ref={loupe.refVisuel}
      src={hd === 'oui' ? item.url : displaySrc(item, 'view')}
      alt={item.stem}
      draggable={false}
      className={
        mode === 'contain'
          ? 'w-full h-full object-contain'
          : mode === 'scroll-y'
            ? 'block mx-auto h-auto'
            : 'block w-auto max-w-none'
      }
      style={limites(item, mode, loupe.echelle)}
    />
  )

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
        {(item.view || item.preview) && (
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
        <span className={`caption text-subtle mono shrink-0 ${item.view || item.preview ? '' : 'ml-auto'}`}>
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

      <div className="relative flex-1 min-h-0 flex items-center gap-2 px-2 sm:px-4 py-4">
        <button
          onClick={() => onMove(-1)}
          className="h-12 w-12 rounded-full hover:bg-surface transition-colors flex items-center justify-center shrink-0"
          aria-label="Précédent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div
          ref={(el) => {
            setDefilant(el)
            loupe.refZone(el)
          }}
          tabIndex={mode === 'contain' ? undefined : 0}
          {...loupe.gestes}
          className={`flex-1 h-full min-w-0 focus:outline-none ${loupe.gestes.className} ${
            mode === 'contain'
              ? // `relative` + `overflow-hidden` : le visuel agrandi est deplace
                // dans cette fenetre, et ne deborde pas sur les fleches.
                'relative overflow-hidden'
              : mode === 'scroll-y'
                ? // Pas de centrage flex ici : un contenu plus grand que sa boite
                  // centree se fait rogner en haut, et le debut du visuel — le
                  // plus utile — devient inatteignable.
                  `overflow-y-auto ${loupe.zoome ? 'overflow-x-auto' : 'overflow-x-hidden'}`
                : `overflow-x-auto flex ${loupe.zoome ? 'overflow-y-auto items-start' : 'overflow-y-hidden items-center'}`
          }`}
        >
          {item.bande?.length ? (
            /* Les tranches, bout a bout : le navigateur ne decode que celles
               qui approchent de l'ecran, d'ou `lazy` et les dimensions posees. */
            <div
              ref={loupe.refVisuel}
              className="mx-auto"
              style={{
                width: `${loupe.echelle * 100}%`,
                maxWidth: `${Math.min(item.bw ?? LECTURE_MAX, LECTURE_MAX) * loupe.echelle}px`,
              }}
            >
              {item.bande.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={i === 0 ? item.stem : ''}
                  width={item.bw}
                  height={trancheH(item, i)}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="block w-full h-auto"
                />
              ))}
            </div>
          ) : item.kind === 'video' ? (
            /* Le `preview` (960 px, CRF 30) suffit à l'écran ; le master du
               vault, jusqu'à 21 Mo, reste derrière le lien « original ». */
            <video
              src={playSrc(item)}
              poster={item.thumb}
              controls
              autoPlay
              loop
              preload="metadata"
              className="w-full h-full object-contain"
            />
          ) : mode === 'contain' ? (
            /* La boite de la loupe : elle couvre la zone, donc les pourcentages
               de `limites` et l'ancrage du zoom parlent bien de la meme surface. */
            <div className="absolute inset-0 flex items-center justify-center" style={loupe.transform}>
              {visuel}
            </div>
          ) : (
            visuel
          )}
        </div>

        <LoupeControls loupe={loupe} className="absolute bottom-1 right-4 sm:right-6 z-10" />

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

      <div className="px-5 sm:px-8 pb-5 shrink-0 flex items-baseline gap-4">
        <p className="caption text-subtle mono truncate">{item.path}</p>
        <span className="caption text-subtle/70 shrink-0 ml-auto flex items-baseline gap-3">
          {hd !== 'non' && (
            <span title={`Fichier d'origine (${fmtBytes(item.size)})`}>
              {hd === 'oui' ? "pixels d'origine" : 'original en cours…'}
            </span>
          )}
          {loupe.zoome && mode === 'contain' && <span>glisser pour déplacer · 0 pour revenir</span>}
          {mode !== 'contain' && (
            <span>
              {mode === 'scroll-x'
                ? 'bande très large · défiler pour lire'
                : item.bande?.length
                  ? `page entière · ${item.bande.length} écrans · défiler pour lire`
                  : 'visuel très haut · défiler pour lire'}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
