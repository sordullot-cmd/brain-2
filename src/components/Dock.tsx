import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PagerItem } from './Spec'

/* --------------------------------------------------------------------------
   Barre flottante — les commandes qui doivent rester sous la main
   pendant qu'on descend dans une page longue.

   Le bandeau d'une fiche projet porte déjà ses flèches précédent / suivant,
   mais il sort de l'écran au premier écran de scroll : sur une fiche de 2000 px
   il faut remonter tout en haut pour passer au projet d'à côté. La barre reprend
   ces mêmes flèches, plus un retour en haut de page, et n'apparaît qu'une fois
   le bandeau dépassé — tant qu'il est visible, elle ferait doublon.

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

/** Seuil d'apparition : la hauteur du bandeau, flèches d'origine comprises. */
const SEUIL = 420

export function Dock() {
  const { pager } = useContext(DockCtx)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SEUIL)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Le retour en haut est un déplacement, pas une animation : qui a coupé les
  // animations dans son système veut y être, pas y glisser pendant 800 ms.
  const toTop = useCallback(() => {
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: doux ? 'smooth' : 'auto' })
  }, [])

  return (
    <div
      className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 transition-all duration-300 sm:bottom-6 sm:right-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      {(pager.prev || pager.next) && (
        <div className="flex items-center gap-1 rounded-full border border-border bg-background/85 p-1 backdrop-blur-md">
          <DockPagerLink item={pager.prev} direction="prev" />
          <DockPagerLink item={pager.next} direction="next" />
        </div>
      )}

      <button
        onClick={toTop}
        tabIndex={visible ? 0 : -1}
        aria-label="Remonter en haut de la page"
        title="Remonter en haut"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/85 text-subtle backdrop-blur-md transition-colors hover:border-brand/40 hover:text-foreground"
      >
        <span aria-hidden="true" className="text-[15px] leading-none">
          ↑
        </span>
      </button>
    </div>
  )
}

function DockPagerLink({ item, direction }: { item: PagerItem | null; direction: 'prev' | 'next' }) {
  const isPrev = direction === 'prev'
  const arrow = isPrev ? '←' : '→'
  const shell = 'flex h-9 w-9 items-center justify-center rounded-full text-[15px] leading-none transition-colors'

  // Une flèche morte plutôt qu'un trou : les deux boutons gardent leur place,
  // la barre ne change pas de largeur d'un projet à l'autre.
  if (!item)
    return (
      <span className={`${shell} text-subtle/25`} aria-hidden="true">
        {arrow}
      </span>
    )

  return (
    <Link
      to={item.to}
      className={`${shell} text-subtle hover:bg-surface hover:text-foreground`}
      title={`${isPrev ? 'Projet précédent' : 'Projet suivant'} : ${item.title}`}
      aria-label={`${isPrev ? 'Projet précédent' : 'Projet suivant'} : ${item.title}`}
    >
      <span aria-hidden="true">{arrow}</span>
    </Link>
  )
}
