import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { VaultData } from '../lib/vault'

// « Notes » n'est volontairement pas exposé ici : la route /notes reste
// accessible (liens internes, recherche), elle n'est plus dans la navigation.
const NAV = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/projets', label: 'Projets' },
  { to: '/tags', label: 'Tags' },
]

export function Layout({
  data,
  children,
  onSearch,
}: {
  data: VaultData
  children: React.ReactNode
  onSearch: () => void
}) {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Remonter en haut à chaque navigation
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={`sticky top-0 z-40 bg-background/85 backdrop-blur-md transition-colors ${
          scrolled ? 'border-b border-border' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 h-16 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="w-2.5 h-2.5 rounded-full bg-brand group-hover:bg-accent transition-colors" />
            <span className="label">{data.vaultName}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `label px-3 py-2 rounded-full transition-colors ${
                    isActive ? 'bg-surface-strong text-foreground' : 'text-subtle hover:text-foreground hover:bg-surface'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onSearch}
              className="flex items-center gap-2.5 h-9 pl-3 pr-2 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
              aria-label="Rechercher dans le vault"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <span className="label hidden sm:inline">Rechercher</span>
              <kbd className="caption hidden sm:inline px-1.5 py-1 rounded bg-surface-strong text-subtle mono">⌘K</kbd>
            </button>
          </div>
        </div>

        {/* Navigation mobile */}
        <div className="md:hidden border-t border-border overflow-x-auto">
          <div className="flex px-5 gap-1 py-2 min-w-max">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `label px-3 py-1.5 rounded-full whitespace-nowrap ${
                    isActive ? 'bg-surface-strong text-foreground' : 'text-subtle'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border mt-24">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-10 flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <span className="label">{data.vaultName}</span>
          <span className="caption text-subtle">
            {data.stats.notesTotal} notes · {data.stats.media} médias · {data.stats.tags} tags
          </span>
          <span className="caption text-subtle mono ml-auto">
            indexé le{' '}
            {new Date(data.generatedAt).toLocaleString('fr-FR', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </footer>
    </div>
  )
}

/** Titre de page uniforme : sur-titre, titre géant, description. */
export function PageHead({
  eyebrow,
  title,
  desc,
  right,
}: {
  eyebrow?: string
  title: string
  desc?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-14 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          {eyebrow && <div className="caption uppercase text-subtle mb-4">{eyebrow}</div>}
          <h1 className="display-xl">{title}</h1>
          {desc && <p className="mt-5 text-[15px] leading-relaxed text-muted max-w-2xl text-pretty">{desc}</p>}
        </div>
        {right}
      </div>
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-border rounded-2xl px-8 py-16 text-center">
      <p className="label text-subtle">{title}</p>
      {hint && <p className="caption text-subtle/70 mt-3 max-w-md mx-auto leading-relaxed">{hint}</p>}
    </div>
  )
}
