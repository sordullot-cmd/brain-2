/**
 * Briques de présentation « spécimen » — la mise en page d'une charte de marque :
 * bandeau teinté, sommaire collant à gauche, grands cartons de présentation au
 * centre, colonne de commentaire à droite.
 *
 * Sert à présenter un projet (un univers, un produit) aspect par aspect plutôt
 * qu'en une seule grille indifférenciée.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/* --------------------------------------------------------------------------
   Couleur
   -------------------------------------------------------------------------- */

/** "#abc" | "#aabbcc" → {r,g,b}. null si la valeur n'est pas un hex. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Luminance relative (WCAG), pour choisir un texte noir ou blanc par-dessus. */
export function luminance(hex: string): number {
  const c = hexToRgb(hex)
  if (!c) return 1
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

export const isLight = (hex: string) => luminance(hex) > 0.45

/* --------------------------------------------------------------------------
   Bandeau de tête
   -------------------------------------------------------------------------- */

export function SpecHero({
  eyebrow,
  title,
  desc,
  tint,
  art,
  artAlt,
  right,
  pager,
}: {
  eyebrow?: string
  title: string
  desc?: string
  /** Couleur de fond du bandeau (hex). Défaut : la couleur de marque du site. */
  tint?: string | null
  /** Visuel posé à droite, qui déborde du bandeau. */
  art?: string | null
  artAlt?: string
  right?: React.ReactNode
  /** Flèches de navigation entre projets, posées en haut du bandeau. */
  pager?: React.ReactNode
}) {
  const bg = tint && hexToRgb(tint) ? tint : '#00082e'
  const light = isLight(bg)
  const fg = light ? '#000' : '#fff'

  return (
    <div className="relative overflow-hidden" style={{ background: bg, color: fg }}>
      {art && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] items-center justify-end pr-5 sm:pr-8 md:flex"
          aria-hidden="true"
        >
          {/* Dimensions explicites : object-contain agrandit aussi les petits visuels. */}
          <img
            src={art}
            alt=""
            className="h-[64%] w-full max-w-[90%] object-contain object-right"
            style={{ filter: light ? 'none' : 'drop-shadow(0 12px 40px rgba(0,0,0,.28))' }}
          />
        </div>
      )}

      {/* Flèches ancrées en haut à gauche : le contenu du bandeau est aligné en bas
          (justify-end), et le visuel de couverture occupe la droite. */}
      {pager && (
        <div className="absolute inset-x-0 top-5 z-10 sm:top-6">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">{pager}</div>
        </div>
      )}

      <div className="relative mx-auto flex max-w-[1400px] flex-col justify-end px-5 pt-16 pb-12 sm:px-8 sm:pt-24 sm:pb-16 min-h-[300px] sm:min-h-[360px]">
        {eyebrow && (
          <div className="caption uppercase tracking-[0.14em] mb-5" style={{ opacity: 0.72 }}>
            {eyebrow}
          </div>
        )}
        <h1 className="display-xl max-w-[9ch] sm:max-w-none lowercase">{title}</h1>
        {desc && (
          <p
            className="mt-6 max-w-md text-[13.5px] leading-[1.6] text-pretty md:max-w-lg"
            style={{ opacity: 0.85 }}
          >
            {desc}
          </p>
        )}
        {right && <div className="mt-8">{right}</div>}
      </div>

      {/* Visuel en dessous du texte sur mobile, où il n'y a pas la place à droite */}
      {art && (
        <div className="relative flex justify-center px-5 pb-10 md:hidden" aria-hidden="true">
          <img src={art} alt={artAlt ?? ''} className="max-h-40 max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Flèches de navigation entre projets
   -------------------------------------------------------------------------- */

export interface PagerItem {
  /** Route de destination, ex. /univers/kraken */
  to: string
  title: string
}

/**
 * Précédent / suivant, à poser en haut d'un bandeau `SpecHero`. Les couleurs
 * sont héritées (`currentColor`) pour rester lisibles sur un fond teinté.
 * Le nom de la destination n'apparaît qu'à partir de `sm` — sur mobile, les
 * flèches seules.
 */
export function SpecPager({ prev, next }: { prev?: PagerItem | null; next?: PagerItem | null }) {
  if (!prev && !next) return null

  return (
    <div className="flex items-center gap-2" aria-label="Navigation entre projets">
      <PagerLink item={prev} direction="prev" />
      <PagerLink item={next} direction="next" />
    </div>
  )
}

function PagerLink({ item, direction }: { item?: PagerItem | null; direction: 'prev' | 'next' }) {
  const isPrev = direction === 'prev'
  const arrow = isPrev ? '←' : '→'
  const shell =
    'label flex h-9 items-center gap-2 rounded-full border border-current/25 px-3 transition-opacity'

  if (!item) {
    return (
      <span className={`${shell} opacity-25`} aria-hidden="true">
        {arrow}
      </span>
    )
  }

  return (
    <Link
      to={item.to}
      className={`${shell} opacity-80 hover:opacity-100`}
      title={`${isPrev ? 'Précédent' : 'Suivant'} : ${item.title}`}
      aria-label={`${isPrev ? 'Projet précédent' : 'Projet suivant'} : ${item.title}`}
    >
      {isPrev && <span aria-hidden="true">{arrow}</span>}
      <span className="hidden max-w-[22ch] truncate sm:inline">{item.title}</span>
      {!isPrev && <span aria-hidden="true">{arrow}</span>}
    </Link>
  )
}

/* --------------------------------------------------------------------------
   Sommaire collant
   -------------------------------------------------------------------------- */

export interface SpecSection {
  id: string
  label: string
  count?: number
}

/** Section actuellement sous la ligne de flottaison, pour surligner le sommaire. */
export function useScrollSpy(ids: string[], offset = 140): string | null {
  const key = ids.join('|')
  const [active, setActive] = useState<string | null>(ids[0] ?? null)

  useEffect(() => {
    const list = key ? key.split('|') : []
    if (!list.length) return

    const onScroll = () => {
      let current = list[0]
      for (const id of list) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= offset) current = id
      }
      setActive(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [key, offset])

  return active
}

export function SpecNav({
  title,
  sections,
  active,
  tint,
}: {
  title: string
  sections: SpecSection[]
  active: string | null
  tint?: string | null
}) {
  const accent = tint && hexToRgb(tint) && !isLight(tint) ? tint : undefined

  return (
    // self-start est indispensable : sans lui, la grille parente étire le <nav> sur
    // toute la hauteur de la page et `sticky` n'a plus rien à faire glisser — le
    // sommaire disparaissait dès qu'on descendait.
    <nav className="sticky top-24 self-start hidden lg:block" aria-label="Sommaire">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="label border-b border-border px-4 py-3.5">{title}</div>
        <ul className="py-1.5">
          {sections.map((s) => {
            const on = s.id === active
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`label flex items-baseline gap-2 px-4 py-2.5 transition-colors ${
                    on ? 'text-foreground' : 'text-subtle hover:text-foreground'
                  }`}
                  style={on && accent ? { color: accent } : undefined}
                  aria-current={on ? 'true' : undefined}
                >
                  <span className="truncate">{s.label}</span>
                  {s.count !== undefined && (
                    <span className="caption tabular-nums ml-auto shrink-0 opacity-55">{s.count}</span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

/** Sommaire horizontal défilant, pour les petits écrans. */
export function SpecNavMobile({ sections, active }: { sections: SpecSection[]; active: string | null }) {
  return (
    <div className="lg:hidden -mx-5 sm:-mx-8 mb-10 overflow-x-auto border-y border-border">
      <div className="flex min-w-max gap-1 px-5 py-2.5 sm:px-8">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`label whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
              s.id === active ? 'bg-surface-strong text-foreground' : 'text-subtle'
            }`}
          >
            {s.label}
            {s.count !== undefined && <span className="tabular-nums opacity-55"> {s.count}</span>}
          </a>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Rangée : grand carton au centre, commentaire à droite
   -------------------------------------------------------------------------- */

export function SpecRow({
  id,
  eyebrow,
  title,
  notes,
  meta,
  children,
  first,
}: {
  id: string
  eyebrow?: string
  title: string
  /** Paragraphes de commentaire, dans la colonne de droite. */
  notes?: React.ReactNode[]
  /** Petites lignes factuelles (nombre de fichiers, formats…), sous le commentaire. */
  meta?: React.ReactNode
  children: React.ReactNode
  first?: boolean
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_240px] ${
        first ? '' : 'mt-16 border-t border-border pt-16'
      }`}
    >
      {/* Commentaire : au-dessus sur mobile, à droite sur grand écran */}
      <div className="lg:order-2">
        <div className="lg:sticky lg:top-24">
          {eyebrow && <div className="caption uppercase tracking-[0.12em] text-subtle mb-2.5">{eyebrow}</div>}
          <h2 className="text-[21px] font-bold leading-[1.15] tracking-[-0.02em]">{title}</h2>
          {notes && notes.length > 0 && (
            <div className="mt-4 space-y-3.5">
              {notes.map((n, i) => (
                <p key={i} className="text-[13px] leading-[1.6] text-muted text-pretty">
                  {n}
                </p>
              ))}
            </div>
          )}
          {meta && <div className="caption text-subtle/70 mono mt-5 leading-[1.7]">{meta}</div>}
        </div>
      </div>

      <div className="min-w-0 lg:order-1">{children}</div>
    </section>
  )
}

/** Le grand carton gris sur lequel on pose les visuels. */
export function SpecCanvas({
  children,
  className = '',
  pad = 'normal',
}: {
  children: React.ReactNode
  className?: string
  pad?: 'normal' | 'tight'
}) {
  return (
    <div
      className={`rounded-xl bg-surface ${pad === 'tight' ? 'p-4 sm:p-6' : 'p-6 sm:p-10'} ${className}`}
    >
      {children}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Nuancier
   -------------------------------------------------------------------------- */

/** Une couleur présentée en fiche : aplat, rang, hex et RGB. */
export function SwatchCard({ hex, rank }: { hex: string; rank: number }) {
  const rgb = hexToRgb(hex)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(hex).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div
        className="h-24 rounded-md border border-border sm:h-28"
        style={{ background: hex }}
        title={hex}
      />
      <div className="mt-3 flex items-baseline gap-2 border-b border-border pb-2.5">
        <button
          onClick={copy}
          className="label truncate uppercase hover:text-brand transition-colors"
          aria-label={`Copier ${hex}`}
        >
          {copied ? 'copié' : hex.replace('#', '')}
        </button>
        <span className="caption tabular-nums ml-auto shrink-0 text-subtle/60">{rank}</span>
      </div>
      <dl className="caption mt-2.5 space-y-1.5 text-subtle">
        <div className="flex gap-3">
          <dt className="w-8 shrink-0 opacity-70">Hex</dt>
          <dd className="mono truncate">{hex.toUpperCase()}</dd>
        </div>
        {rgb && (
          <div className="flex gap-3">
            <dt className="w-8 shrink-0 opacity-70">RGB</dt>
            <dd className="mono truncate">
              {rgb.r} {rgb.g} {rgb.b}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

export function SwatchGrid({ colors }: { colors: string[] }) {
  const list = useMemo(() => colors.filter((c) => hexToRgb(c)), [colors])
  if (!list.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((c, i) => (
        <SwatchCard key={`${c}-${i}`} hex={c} rank={i + 1} />
      ))}
    </div>
  )
}
