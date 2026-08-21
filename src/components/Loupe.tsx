import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Loupe — un vrai zoom SUR LE VISUEL, pas celui du navigateur.
 *
 * Le zoom de la page agrandit tout, en-tête et légendes comprises, et s'arrête
 * au pixel affiché. Ici seul le visuel grossit : la molette (ou le pincement)
 * zoome au point visé, on se déplace en le tirant, et la visionneuse peut aller
 * chercher les pixels de l'original quand le dérivé ne suffit plus.
 *
 * Deux mécaniques selon l'affichage, une seule échelle pour les deux :
 *
 *   — **`deplacable`** (visuel contenu dans l'écran) : le visuel est transformé
 *     (`translate` + `scale`), et c'est la loupe qui gère le déplacement, borné
 *     pour ne jamais perdre le visuel hors de la zone.
 *   — **défilement** (visuel à rallonge, déjà plus grand que l'écran) : rien à
 *     transformer, l'échelle multiplie simplement la largeur de lecture et le
 *     navigateur continue de faire défiler.
 */

export const LOUPE_MIN = 1
export const LOUPE_MAX = 8
/** Pas des boutons et du clavier ; la molette, elle, reste continue. */
const PAS = 1.4
/** Où mène un double-clic quand on n'est pas déjà zoomé. */
const DOUBLE_CLIC = 2.5

const borne = (v: number) => Math.min(LOUPE_MAX, Math.max(LOUPE_MIN, v))

type Etat = { s: number; x: number; y: number }
const REPOS: Etat = { s: 1, x: 0, y: 0 }

type Geste =
  | { type: 'glisse'; base: Etat; depart: { x: number; y: number } }
  | { type: 'pince'; base: Etat; ecart: number; milieu: { x: number; y: number } }

export type Loupe = ReturnType<typeof useLoupe>

/**
 * @param cle        change de valeur quand on passe à un autre visuel : la loupe repart à 100 %.
 * @param deplacable le visuel tient dans la zone, c'est donc la loupe qui le déplace.
 * @param actif      une vidéo garde ses propres commandes : pas de loupe dessus.
 */
export function useLoupe({ cle, deplacable, actif = true }: { cle: string; deplacable: boolean; actif?: boolean }) {
  const [etat, setEtat] = useState<Etat>(REPOS)
  const [zone, setZone] = useState<HTMLElement | null>(null)
  const [visuel, setVisuel] = useState<HTMLElement | null>(null)

  // Ce que le DOM affiche vraiment : les mesures ci-dessous lisent des
  // rectangles déjà transformés, il faut savoir par quoi pour les remettre à
  // l'échelle 1. Un effet de mise en page tient ce miroir à jour avant peinture.
  const affiche = useRef<Etat>(REPOS)
  useLayoutEffect(() => {
    affiche.current = etat
  }, [etat])

  const geste = useRef<Geste | null>(null)
  const pointeurs = useRef(new Map<number, { x: number; y: number }>())

  const repos = useCallback(() => setEtat(REPOS), [])

  // Un autre visuel, ou une loupe qui s'éteint : on repart de la taille
  // d'origine. Remise à jour PENDANT le rendu, et pas dans un effet, pour que
  // l'échelle lue par la visionneuse soit déjà celle du nouveau visuel.
  const [precedent, setPrecedent] = useState({ cle, deplacable, actif })
  if (precedent.cle !== cle || precedent.deplacable !== deplacable || precedent.actif !== actif) {
    setPrecedent({ cle, deplacable, actif })
    setEtat(REPOS)
    geste.current = null
    pointeurs.current.clear()
  }

  /**
   * Le visuel tel qu'il serait sans loupe, en coordonnées de la zone.
   *
   * `object-contain` laisse du vide dans la boîte de l'image : on ne mesure pas
   * cette boîte mais l'image PEINTE dedans, sinon on pourrait tirer le visuel
   * jusqu'à ne plus voir que sa marge.
   */
  const mesure = useCallback(() => {
    const z = zone?.getBoundingClientRect()
    const v = visuel?.getBoundingClientRect()
    if (!z || !v) return null
    const a = affiche.current
    const boite = { x: (v.left - z.left - a.x) / a.s, y: (v.top - z.top - a.y) / a.s, w: v.width / a.s, h: v.height / a.s }
    const img = visuel instanceof HTMLImageElement && visuel.naturalWidth ? visuel : null
    if (img) {
      const k = Math.min(boite.w / img.naturalWidth, boite.h / img.naturalHeight)
      const pw = img.naturalWidth * k
      const ph = img.naturalHeight * k
      boite.x += (boite.w - pw) / 2
      boite.y += (boite.h - ph) / 2
      boite.w = pw
      boite.h = ph
    }
    return { ...boite, zw: z.width, zh: z.height }
  }, [zone, visuel])

  /**
   * Recadre le déplacement : sur un axe où le visuel dépasse, ses bords restent
   * collés à la zone (on ne tire pas du vide) ; sur l'autre, il reste centré.
   */
  const recadre = useCallback(
    (e: Etat): Etat => {
      const u = mesure()
      if (!u) return e
      const axe = (t: number, debut: number, taille: number, zt: number) => {
        const etendue = taille * e.s
        if (etendue <= zt) return (zt - etendue) / 2 - debut * e.s
        return Math.min(-debut * e.s, Math.max(zt - (debut + taille) * e.s, t))
      }
      return { s: e.s, x: axe(e.x, u.x, u.w, u.zw), y: axe(e.y, u.y, u.h, u.zh) }
    },
    [mesure]
  )

  /**
   * En défilement, l'échelle change la taille du contenu et le navigateur garde
   * le même `scrollTop` : le point visé fuit. On note où il se trouve dans le
   * contenu, et on rattrape le défilement une fois la mise en page faite.
   */
  const suivi = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  useLayoutEffect(() => {
    const c = suivi.current
    suivi.current = null
    if (!c || !zone) return
    zone.scrollTo({ left: c.x * etat.s - c.px, top: c.y * etat.s - c.py })
  }, [etat.s, zone])

  /** Zoome de `facteur`, en gardant sous le curseur le point qu'il désigne. */
  const zoomer = useCallback(
    (facteur: number, ancre?: { x: number; y: number }) => {
      if (!actif) return
      setEtat((prec) => {
        const s = borne(prec.s * facteur)
        if (s === prec.s) return prec
        if (!deplacable) {
          const p = ancre ?? { x: (zone?.clientWidth ?? 0) / 2, y: (zone?.clientHeight ?? 0) / 2 }
          // La largeur du contenu suit l'echelle, donc diviser par elle donne
          // bien une position dans le visuel, independante du zoom.
          suivi.current = {
            x: ((zone?.scrollLeft ?? 0) + p.x) / prec.s,
            y: ((zone?.scrollTop ?? 0) + p.y) / prec.s,
            px: p.x,
            py: p.y,
          }
          return { ...REPOS, s }
        }
        if (s === LOUPE_MIN) return REPOS
        const z = zone?.getBoundingClientRect()
        const p = ancre ?? { x: (z?.width ?? 0) / 2, y: (z?.height ?? 0) / 2 }
        const k = s / prec.s
        return recadre({ s, x: p.x + (prec.x - p.x) * k, y: p.y + (prec.y - p.y) * k })
      })
    },
    [actif, deplacable, zone, recadre]
  )

  /** Coordonnées d'un événement dans la zone. */
  const dansZone = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const z = zone?.getBoundingClientRect()
      return { x: e.clientX - (z?.left ?? 0), y: e.clientY - (z?.top ?? 0) }
    },
    [zone]
  )

  /* ------------------------------------------------------------- molette
     Écoute posée à la main : React branche `wheel` en passif, et un écouteur
     passif ne peut pas empêcher le défilement — ni donc zoomer à sa place. */
  useEffect(() => {
    if (!zone || !actif) return
    const onWheel = (e: WheelEvent) => {
      // Là où il y a de quoi défiler, la molette défile : le zoom demande alors
      // la touche de commande — c'est aussi ce qu'envoie un pincement de pavé.
      const commande = e.ctrlKey || e.metaKey
      if (!deplacable && !commande) return
      e.preventDefault()
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      const f = Math.min(2, Math.max(0.5, Math.exp(-d * (commande ? 0.012 : 0.0035))))
      zoomer(f, dansZone(e))
    }
    zone.addEventListener('wheel', onWheel, { passive: false })
    return () => zone.removeEventListener('wheel', onWheel)
  }, [zone, actif, deplacable, zoomer, dansZone])

  // La zone change de taille (fenetre redimensionnee) : un visuel deja zoome
  // resterait de travers, on le recadre.
  useEffect(() => {
    const onResize = () => setEtat((prec) => (prec.s > LOUPE_MIN ? recadre(prec) : prec))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [recadre])

  /* ------------------------------------------------------------- clavier */
  useEffect(() => {
    if (!actif) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return
      if (e.key === '+' || e.key === '=') zoomer(PAS)
      else if (e.key === '-' || e.key === '_') zoomer(1 / PAS)
      else if (e.key === '0') repos()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actif, zoomer, repos])

  /* ------------------------------------------- glisser (souris et un doigt)
     et pincer (deux doigts) : un seul jeu d'événements pointeur pour les deux. */
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!actif) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointeurs.current.set(e.pointerId, dansZone(e))
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()]
      geste.current = {
        type: 'pince',
        base: etat,
        ecart: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      return
    }
    if (pointeurs.current.size === 1 && deplacable && etat.s > LOUPE_MIN) {
      geste.current = { type: 'glisse', base: etat, depart: dansZone(e) }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!geste.current || !pointeurs.current.has(e.pointerId)) return
    const p = dansZone(e)
    pointeurs.current.set(e.pointerId, p)
    const g = geste.current
    if (g.type === 'pince') {
      const [a, b] = [...pointeurs.current.values()]
      if (!a || !b) return
      const s = borne((g.base.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.ecart)
      if (!deplacable) return zoomer(s / etat.s, g.milieu)
      setEtat(() => {
        const k = s / g.base.s
        return recadre({ s, x: g.milieu.x + (g.base.x - g.milieu.x) * k, y: g.milieu.y + (g.base.y - g.milieu.y) * k })
      })
      return
    }
    setEtat(() => recadre({ s: g.base.s, x: g.base.x + (p.x - g.depart.x), y: g.base.y + (p.y - g.depart.y) }))
  }

  const onPointerFin = (e: ReactPointerEvent) => {
    pointeurs.current.delete(e.pointerId)
    if (pointeurs.current.size < 2 && geste.current?.type === 'pince') geste.current = null
    if (pointeurs.current.size === 0) geste.current = null
  }

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!actif) return
    if (etat.s > LOUPE_MIN) return repos()
    zoomer(DOUBLE_CLIC / etat.s, dansZone(e))
  }

  const zoome = etat.s > LOUPE_MIN

  /** À poser sur la zone qui reçoit les gestes. */
  const gestes = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerFin,
    onPointerCancel: onPointerFin,
    onDoubleClick,
    style: {
      // Sans cela le navigateur s'approprie le pincement et le déplacement.
      touchAction: actif ? (deplacable ? 'none' : 'pan-x pan-y') : undefined,
    } as CSSProperties,
    className: !actif
      ? ''
      : geste.current?.type === 'glisse'
        ? 'cursor-grabbing select-none'
        : zoome && deplacable
          ? 'cursor-grab select-none'
          : 'cursor-zoom-in',
  }

  /** À poser sur le visuel transformé (mode contenu seulement). */
  const transform: CSSProperties = useMemo(
    () =>
      zoome && deplacable
        ? { transform: `translate(${etat.x}px, ${etat.y}px) scale(${etat.s})`, transformOrigin: '0 0', willChange: 'transform' }
        : {},
    [zoome, deplacable, etat]
  )

  return { echelle: etat.s, zoome, actif, zoomer, repos, refZone: setZone, refVisuel: setVisuel, gestes, transform }
}

/** Les commandes de la loupe : moins, l'échelle (qui remet à 100 %), plus. */
export function LoupeControls({ loupe, className = '' }: { loupe: Loupe; className?: string }) {
  const { echelle, zoomer, repos, actif } = loupe
  if (!actif) return null
  const btn =
    'h-8 w-8 rounded-full flex items-center justify-center transition-colors hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div
      className={`flex items-center gap-0.5 rounded-full border border-border bg-white/85 backdrop-blur-sm px-1 py-1 ${className}`}
    >
      <button
        onClick={() => zoomer(1 / PAS)}
        disabled={echelle <= LOUPE_MIN}
        className={btn}
        aria-label="Réduire"
        title="Réduire (−)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
      <button
        onClick={repos}
        disabled={echelle === LOUPE_MIN}
        className="caption mono text-subtle px-1.5 h-8 min-w-12 rounded-full hover:bg-surface transition-colors disabled:hover:bg-transparent"
        title="Taille d'origine (0)"
      >
        {Math.round(echelle * 100)} %
      </button>
      <button
        onClick={() => zoomer(PAS)}
        disabled={echelle >= LOUPE_MAX}
        className={btn}
        aria-label="Agrandir"
        title="Agrandir (+) · molette, double-clic"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
