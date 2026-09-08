import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { useDockPager } from '../components/Dock'
import { SpecNav, SpecNavMobile, SpecPager, useScrollSpy, type PagerItem, type SpecSection } from '../components/Spec'
import { NoteBody } from './Projet'
import {
  COURS_DOMAIN,
  coursSections,
  coursUrl,
  cycleDe,
  fiche,
  fmtBytes,
  fmtDate,
  indexById,
  norm,
  noteUrl,
  useNotesText,
  type Note,
  type VaultData,
} from '../lib/vault'

/* --------------------------------------------------------------------------
   Les cours — le dossier « eco gestion » du vault, lu comme un semestre.

   Ces notes passaient déjà dans /notes, noyées parmi les fiches d'inspiration :
   on n'y cherche pourtant pas la même chose. Une fiche de cours se lit dans
   l'ordre où elle tombe (période, puis poids), et ce qui compte à côté du texte
   ce sont ses trous — les points de cours qu'il reste à récupérer — et sa
   dernière revue. C'est exactement ce que les tableaux Dataview montrent dans
   Obsidian ; cette page en est l'équivalent côté site, sans Dataview.
   -------------------------------------------------------------------------- */

/**
 * Teinte d'un statut. Reprend les couleurs des callouts (index.css) : ce qui
 * attend est chaud, ce qui est en cours est froid, ce qui est acquis est vert.
 */
const TEINTE = { attente: '#c2761a', encours: '#0e8ba8', fait: '#10b981', trou: '#d92d5e' } as const

const teinteStatut = (statut: string) => {
  const s = norm(statut)
  if (/(fait|acquis|ok|fini|termin)/.test(s)) return TEINTE.fait
  if (/(cours|commenc|en route)/.test(s)) return TEINTE.encours
  return TEINTE.attente
}

export function CoursList({ data }: { data: VaultData }) {
  const { toutes, fiches, chapitres, exercices, pages, brut } = useMemo(() => coursSections(data), [data])

  /**
   * Le plan de la formation porte son intitulé dans son frontmatter, sous la
   * forme « Licence … — Université … ». Le diplôme fait le titre, le reste
   * (établissement, année) passe en sur-titre : en display-xl, l'intitulé
   * complet tiendrait cinq lignes.
   */
  const plan = pages.find((n) => n.frontmatter.formation)
  const formation = typeof plan?.frontmatter.formation === 'string' ? plan.frontmatter.formation : null
  const [diplome, etablissement] = (formation ?? '').split(/\s+—\s+/)
  const annee = plan?.frontmatter.annee ? String(plan.frontmatter.annee) : null
  const surTitre = ['Cours', etablissement, annee].filter(Boolean).join(' · ')

  /** Les périodes, dans l'ordre : c'est le calendrier des partiels. */
  const periodes = useMemo(() => {
    const map = new Map<number | null, Note[]>()
    for (const n of fiches) {
      const p = fiche(n).periode
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(n)
    }
    return [...map.entries()].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99))
  }, [fiches])

  const total = useMemo(() => {
    const f = fiches.map(fiche)
    return {
      coef: f.reduce((s, x) => s + (x.coef ?? 0), 0),
      trous: f.reduce((s, x) => s + x.aVerifier, 0),
      cartes: f.reduce((s, x) => s + x.cartes, 0),
    }
  }, [fiches])

  if (toutes.length === 0)
    return (
      <>
        <PageHead eyebrow="Cours" title="Rien à réviser" />
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
          <Empty
            title={`Aucune note dans « ${COURS_DOMAIN} »`}
            hint="Le dossier a peut-être été renommé dans le vault. Relance npm run index."
          />
        </div>
      </>
    )

  return (
    <>
      <PageHead
        eyebrow={surTitre}
        title={diplome || 'Mes cours'}
        desc="Les fiches d'UE du vault, dans l'ordre où elles tombent. Chacune porte ce qu'il lui manque encore et la date de sa dernière revue."
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {/* Où j'en suis, en quatre chiffres. */}
        <div className="flex flex-wrap gap-x-14 gap-y-6 pb-12 mb-14 border-b border-border">
          <Chiffre n={fiches.length} l="fiches" />
          <Chiffre n={total.coef} l="coefficients" />
          <Chiffre n={total.trous} l="points à récupérer" teinte={total.trous > 0 ? TEINTE.trou : undefined} />
          <Chiffre n={total.cartes} l="cartes à créer" />
        </div>

        {periodes.length > 0 && (
          <div className="space-y-14">
            {periodes.map(([p, notes]) => (
              <section key={String(p)}>
                <Titre titre={p ? `Période ${p}` : 'Sans période'} compte={notes.length} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {notes.map((n) => (
                    <CarteFiche key={n.id} note={n} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Les cours de méthode des cycles : pas d'UE à eux, mais c'est du cours
            et ça se révise comme tel. */}
        {chapitres.length > 0 && (
          <section className="mt-20">
            <Titre titre="Chapitres de cours" compte={chapitres.length} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {chapitres.map((n) => (
                <Link
                  key={n.id}
                  to={coursUrl(n)}
                  className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
                >
                  {cycleDe(n) && <div className="caption uppercase text-subtle mb-3">{cycleDe(n)}</div>}
                  <div className="label mb-2.5">{n.title}</div>
                  <p className="caption text-subtle line-clamp-2 leading-[1.6]">
                    {String(n.frontmatter.notion ?? n.excerpt ?? '—')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {exercices.length > 0 && (
          <section className="mt-20">
            <Titre titre="Exercices" compte={exercices.length} />
            <div className="flex flex-wrap gap-2">
              {exercices.map((n) => (
                <Link
                  key={n.id}
                  to={coursUrl(n)}
                  className="label px-4 py-2.5 rounded-full bg-surface text-subtle hover:bg-surface-strong hover:text-foreground transition-colors"
                >
                  {n.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        {pages.length > 0 && (
          <section className="mt-20">
            <Titre titre="Autour des fiches" compte={pages.length} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pages.map((n) => (
                <Link
                  key={n.id}
                  to={coursUrl(n)}
                  className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="label truncate">{n.title}</span>
                    {n.isIndex && (
                      <span className="caption px-1.5 py-1 rounded bg-surface-strong text-subtle shrink-0">index</span>
                    )}
                  </div>
                  <p className="caption text-subtle line-clamp-2 leading-[1.6]">{n.excerpt || '—'}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {brut.length > 0 && (
          <section className="mt-20">
            <Titre titre="Notes d'amphi en attente" compte={brut.length} />
            <p className="caption text-subtle leading-relaxed mb-6 max-w-2xl">
              Prises telles quelles, pas encore mises en fiche : ce qui est déposé ici passe en premier au prochain
              tri.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {brut.map((n) => (
                <Link
                  key={n.id}
                  to={coursUrl(n)}
                  className="rounded-xl border border-dashed border-border p-5 hover:border-brand/30 transition-colors"
                >
                  <div className="label truncate mb-2.5">{n.stem}</div>
                  <p className="caption text-subtle line-clamp-2 leading-[1.6] mb-3">{n.excerpt || '—'}</p>
                  <div className="flex items-center gap-3 caption text-subtle/60">
                    <span className="mono">{fmtDate(n.mtime)}</span>
                    <span>{fmtBytes(n.size)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function CarteFiche({ note }: { note: Note }) {
  const f = fiche(note)
  return (
    <Link
      to={coursUrl(note)}
      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors flex flex-col"
    >
      <div className="flex items-center gap-3 mb-3.5">
        <span className="caption uppercase text-subtle">UE {f.ue}</span>
        {f.coef !== null && <span className="caption text-subtle tabular-nums">coef {f.coef}</span>}
        {f.statut && <Statut statut={f.statut} />}
      </div>

      <div className="label mb-2.5">{note.title}</div>
      {f.notion && <p className="caption text-subtle line-clamp-2 leading-[1.6]">{f.notion}</p>}

      <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-baseline gap-x-6 gap-y-2 caption">
        <Metrique
          n={f.aVerifier}
          l="à récupérer"
          teinte={f.aVerifier > 0 ? TEINTE.trou : undefined}
        />
        <Metrique n={f.cartes} l="cartes" />
        {f.revu && <span className="text-subtle/60 mono ml-auto">revu le {fmtDate(f.revu)}</span>}
      </div>
    </Link>
  )
}

function Statut({ statut }: { statut: string }) {
  return (
    <span className="caption text-subtle flex items-center gap-1.5 ml-auto shrink-0">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: teinteStatut(statut) }} aria-hidden />
      {statut}
    </span>
  )
}

function Metrique({ n, l, teinte }: { n: number; l: string; teinte?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tabular-nums" style={teinte ? { color: teinte } : undefined}>
        {n}
      </span>
      <span className="text-subtle/60">{l}</span>
    </span>
  )
}

function Chiffre({ n, l, teinte }: { n: number; l: string; teinte?: string }) {
  return (
    <div>
      <div className="display-md tabular-nums" style={teinte ? { color: teinte } : undefined}>
        {n}
      </div>
      <div className="caption uppercase text-subtle mt-2">{l}</div>
    </div>
  )
}

function Titre({ titre, compte }: { titre: string; compte: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
      <h2 className="label uppercase tracking-wide">{titre}</h2>
      <span className="caption text-subtle tabular-nums">{compte}</span>
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="caption uppercase text-subtle mb-3.5 pb-2.5 border-b border-border">{titre}</div>
      {children}
    </div>
  )
}

/* --------------------------------------------------------------------- fiche */

export function CoursView({ data }: { data: VaultData }) {
  const params = useParams()
  const navigate = useNavigate()
  const idx = useMemo(() => indexById(data), [data])
  const text = useNotesText()

  const id = decodeURIComponent(params['*'] ?? '')
  const note = idx.notes.get(id) ?? data.notes.find((n) => n.slug === id) ?? null

  /**
   * Le sommaire vient du HTML rendu, pas du markdown : l'indexeur a déjà posé
   * les ancres sur chaque titre (`markdown.mjs`), autant les relire. Seuls les
   * H2 y entrent — les H3 d'une fiche découpent un point, pas le cours.
   */
  const html = note ? text?.[note.id]?.html : undefined
  const sections: SpecSection[] = useMemo(() => {
    if (!html) return []
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return [...doc.querySelectorAll('h2[id]')].map((h) => ({
      id: h.id,
      label: (h.textContent ?? '').trim(),
    }))
  }, [html])

  const active = useScrollSpy(sections.map((s) => s.id))

  // Précédent / suivant : l'ordre des fiches d'UE, celui de la liste.
  const { fiches } = useMemo(() => coursSections(data), [data])
  const rang = note ? fiches.findIndex((n) => n.id === note.id) : -1
  const item = (n: Note | undefined): PagerItem | null => (n ? { to: coursUrl(n), title: n.title } : null)
  const prev = useMemo(() => (rang > 0 ? item(fiches[rang - 1]) : null), [fiches, rang])
  const next = useMemo(() => (rang >= 0 ? item(fiches[rang + 1]) : null), [fiches, rang])
  useDockPager(prev, next)

  /**
   * Les liens internes restent dans la SPA — et dans la section : une fiche qui
   * renvoie au plan ou aux ressources reste sous /cours, au lieu de faire
   * basculer la lecture dans /notes au premier lien suivi.
   */
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (a.getAttribute('data-internal') !== '1' && !href.startsWith('/note/')) return
    e.preventDefault()
    const [chemin, ancre] = href.split('#')
    const cible = idx.notes.get(decodeURIComponent(chemin.replace(/^\/note\//, '')))
    const base = cible?.domain === COURS_DOMAIN ? coursUrl(cible) : chemin
    navigate(ancre ? `${base}#${ancre}` : base)
  }

  if (!note)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Fiche introuvable" hint={id} />
      </div>
    )

  const f = fiche(note)
  const links = note.links.map((i) => idx.notes.get(i)!).filter(Boolean)
  const backlinks = note.backlinks.map((i) => idx.notes.get(i)!).filter(Boolean)
  const entete = [f.ue && `UE ${f.ue}`, f.periode && `période ${f.periode}`, f.coef !== null && `coef ${f.coef}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-12 pb-24">
      {/* `data-pager-hero` : la barre flottante reprend les flèches dès que ce
          bloc sort de l'écran (voir Dock). */}
      <div data-pager-hero>
        <div className="flex items-center justify-between gap-4 mb-10">
          <Link to="/cours" className="label text-subtle hover:text-foreground transition-colors">
            ← Cours
          </Link>
          <SpecPager prev={prev} next={next} />
        </div>

        <div className="caption uppercase text-subtle mb-5">{entete || 'Note de cours'}</div>
        <h1 className="display-md max-w-4xl">{note.title}</h1>
        {f.notion && <p className="mt-5 text-[15px] leading-relaxed text-muted max-w-2xl text-pretty">{f.notion}</p>}

        {/* Le suivi ne vaut que pour une fiche d'UE : une note d'amphi n'a ni
            trous comptés ni cartes, afficher deux zéros ne dirait rien. */}
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-3 caption">
          {f.ue ? (
            <>
              {f.statut && (
                <span className="flex items-center gap-1.5 text-subtle">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: teinteStatut(f.statut) }}
                    aria-hidden
                  />
                  {f.statut}
                </span>
              )}
              <Metrique n={f.aVerifier} l="à récupérer" teinte={f.aVerifier > 0 ? TEINTE.trou : undefined} />
              <Metrique n={f.cartes} l="cartes" />
              {f.revu && <span className="text-subtle/60 mono">revu le {fmtDate(f.revu)}</span>}
            </>
          ) : (
            <span className="text-subtle/60 mono">modifiée le {fmtDate(note.mtime)}</span>
          )}
          <span className="text-subtle/60 mono ml-auto truncate">{note.path}</span>
        </div>
      </div>

      {sections.length > 1 && <div className="mt-10"><SpecNavMobile sections={sections} active={active} /></div>}

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-12 lg:gap-16">
        {sections.length > 1 ? (
          <SpecNav title="Sommaire" sections={sections} active={active} />
        ) : (
          <div className="hidden lg:block" />
        )}

        {/* `fiche-cours` masque le H1 du markdown : le titre est déjà en tête de page. */}
        <article onClick={onClick} className="fiche-cours min-w-0">
          <NoteBody id={note.id} media={idx.media} />

          {/* De quoi rebondir sans repasser par la liste : ce que la fiche cite,
              et ce qui la cite. */}
          {(note.tags.length > 0 || links.length > 0 || backlinks.length > 0) && (
            <section className="mt-16 pt-10 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-10">
              {note.tags.length > 0 && (
                <Bloc titre="Tags">
                  <div className="flex flex-wrap gap-1.5">
                    {note.tags.map((t) => (
                      <Link
                        key={t}
                        to={`/tags/${encodeURIComponent(t)}`}
                        className="caption px-2 py-1.5 rounded-full bg-surface text-subtle hover:bg-surface-strong hover:text-foreground transition-colors"
                      >
                        #{t}
                      </Link>
                    ))}
                  </div>
                </Bloc>
              )}
              {links.length > 0 && (
                <Bloc titre={`Cette fiche renvoie à (${links.length})`}>
                  <Liens notes={links} />
                </Bloc>
              )}
              {backlinks.length > 0 && (
                <Bloc titre={`Citée par (${backlinks.length})`}>
                  <Liens notes={backlinks} />
                </Bloc>
              )}
            </section>
          )}
        </article>
      </div>
    </div>
  )
}

/** Une liste de notes, chacune ouverte dans la section où elle vit. */
function Liens({ notes }: { notes: Note[] }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            to={n.domain === COURS_DOMAIN ? coursUrl(n) : noteUrl(n)}
            className="caption text-subtle hover:text-foreground transition-colors block truncate"
          >
            {n.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}
