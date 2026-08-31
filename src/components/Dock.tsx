import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PagerItem } from './Spec'

/* --------------------------------------------------------------------------
   Barre flottante — les commandes qui doivent rester sous la main
   pendant qu'on descend dans une page longue.

   Le bandeau d'une fiche projet porte déjà ses flèches précédent / suivant,
   mais il sort de l'écran au premier écran de scroll : sur une fiche de 2000 px
   il faut remonter tout en haut pour passer au projet d'à côté. La barre reprend
   ces mêmes flèches — nom du projet compris, pour qu'on sache où l'on va sans
   viser une flèche nue — plus un retour en haut de page.

   Les flèches sont déclarées par la page (`useDockPager`) et rendues ici : les
   deux boutons vivent ainsi dans le même coin, sans se marcher dessus.
   -------------------------------------------------------------------------- */

interface Pager {
  prev: PagerItem | null
  next: PagerItem | null
}

const VIDE: Pager = { prev: null, next: null }

const DockCtx = createContext<{ pager: Pager; setPager: (p: Pager) => void }>({
  pager: VIDE,
  setPager: () => {},
})

export function DockProvider({ children }: { children: React.ReactNode }) {
  const [pager, setPager] = useState<Pager>(VIDE)
  const value = useMemo(() => ({ pager, setPager }), [pager])
  return <DockCtx.Provider value={value}>{children}</DockCtx.Provider>
}

/**
 * Déclare les flèches précédent / suivant de la page courante. Elles
 * disparaissent d'elles-mêmes quand on quitte la page.
 */
export function useDockPager(prev: PagerItem | null, next: PagerItem | null) {
  const { setPager } = useContext(DockCtx)
  useEffect(() => {
    setPager({ prev, next })
    return () => setPager(VIDE)
  }, [setPager, prev, next])
}

/** Seuil de repli, pour les pages sans flèches en tête : la hauteur d'un écran de titre. */
const SEUIL = 420

/** Hauteur de l'en-tête collant : passer dessous, c'est déjà être hors de vue. */
const ENTETE = 72

/**
 * Quand montrer la barre.
 *
 * Sur une fiche projet, le moment juste est celui où les flèches du bandeau
 * passent sous l'en-tête : c'est l'instant précis où l'on perdrait la
 * navigation entre projets, et il ne se devine pas à une hauteur en pixels (le
 * bandeau change de taille avec la longueur du titre et la présence d'un
 * visuel). On guette donc l'élément lui-même.
 *
 * L'effet est relancé sur `pager` et non sur l'URL : c'est la page qui déclare
 * ses flèches, une fois son bandeau réellement dans le DOM — au changement
 * d'URL, une fiche chargée à la volée n'est encore que son squelette.
 *
 * Les pages sans bandeau à flèches retombent sur un simple seuil de défilement,
 * pour le seul retour en haut.
 */
function useVisible(pager: Pager) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const cible = document.querySelector('[data-pager-hero]')
    if (cible) {
      const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), {
        rootMargin: `-${ENTETE}px 0px 0px 0px`,
      })
      io.observe(cible)
      return () => io.disconnect()
    }

    const onScroll = () => setVisible(window.scrollY > SEUIL)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pager])

  return visible
}

export function Dock() {
  const { pager } = useContext(DockCtx)
  const visible = useVisible(pager)

  // Le retour en haut est un déplacement, pas une animation : qui a coupé les
  // animations dans son système veut y être, pas y glisser pendant 800 ms.
  const toTop = useCallback(() => {
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: doux ? 'smooth' : 'auto' })
  }, [])

  return (
    <div
      className={`fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2.5rem)] items-center gap-2 transition-all duration-300 sm:bottom-6 sm:right-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      {(pager.prev || pager.next) && (
        <nav
          aria-label="Navigation entre projets"
          className="flex min-w-0 items-center gap-1 rounded-full border border-border bg-background/85 p-1 shadow-[0_12px_40px_-16px_rgba(0,8,46,0.45)] backdrop-blur-md"
        >
          <DockPagerLink item={pager.prev} direction="prev" visible={visible} />
          <DockPagerLink item={pager.next} direction="next" visible={visible} />
        </nav>
      )}

      <button
        onClick={toTop}
        tabIndex={visible ? 0 : -1}
        aria-label="Remonter en haut de la page"
        title="Remonter en haut"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background/85 text-subtle shadow-[0_12px_40px_-16px_rgba(0,8,46,0.45)] backdrop-blur-md transition-colors hover:border-brand/40 hover:text-foreground"
      >
        <span aria-hidden="true" className="text-[15px] leading-none">
          ↑
        </span>
      </button>
    </div>
  )
}

function DockPagerLink({
  item,
  direction,
  visible,
}: {
  item: PagerItem | null
  direction: 'prev' | 'next'
  visible: boolean
}) {
  const isPrev = direction === 'prev'
  const arrow = isPrev ? '←' : '→'
  const shell = 'label flex h-9 min-w-9 items-center justify-center gap-2 rounded-full px-2.5 transition-colors'

  // Une flèche morte plutôt qu'un trou : les deux boutons gardent leur place,
  // la barre ne change pas de largeur d'un projet à l'autre.
  if (!item)
    return (
      <span className={`${shell} text-subtle/25`} aria-hidden="true">
        {arrow}
      </span>
    )

  const role = isPrev ? 'Projet précédent' : 'Projet suivant'

  return (
    <Link
      to={item.to}
      tabIndex={visible ? 0 : -1}
      className={`${shell} min-w-0 text-subtle hover:bg-surface hover:text-foreground`}
      title={`${role} : ${item.title}`}
      aria-label={`${role} : ${item.title}`}
    >
      {isPrev && <span aria-hidden="true">{arrow}</span>}
      {/* Le nom cède la place aux flèches seules sur petit écran : la barre
          flotte au-dessus du contenu, elle n'a pas à le recouvrir. */}
      <span className="hidden max-w-[14ch] truncate md:inline">{item.title}</span>
      {!isPrev && <span aria-hidden="true">{arrow}</span>}
    </Link>
  )
}
