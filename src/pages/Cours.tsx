import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { useDockPager } from '../components/Dock'
import {
  SpecNav,
  SpecNavMobile,
  SpecPager,
  specIds,
  useScrollSpy,
  type PagerItem,
  type SpecSection,
} from '../components/Spec'
import { NoteBody } from './Projet'
import {
  chargerPerso,
  chargerProgression,
  compter,
  fusionner,
  usePaquets,
} from '../lib/flashcards'
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
      // Les cartes réellement écrites dans les blocs « Cartes à créer », pas
      // l'objectif annoncé en frontmatter : c'est ce qui est jouable ce soir.
      cartes: toutes.reduce((s, n) => s + (n.nbCartes ?? 0), 0),
    }
  }, [fiches, toutes])

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
        right={
          total.cartes > 0 ? (
            <Link
              to="/cours/revision"
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
            >
              Réviser les {total.cartes} cartes
            </Link>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {/* Où j'en suis, en quatre chiffres. */}
        <div className="flex flex-wrap gap-x-14 gap-y-6 pb-12 mb-14 border-b border-border">
          <Chiffre n={fiches.length} l="fiches" />
          <Chiffre n={total.coef} l="coefficients" />
          <Chiffre n={total.trous} l="points à récupérer" teinte={total.trous > 0 ? TEINTE.trou : undefined} />
          <Link to="/cours/revision" className="hover:opacity-70 transition-opacity">
            <Chiffre n={total.cartes} l="cartes à réviser" />
          </Link>
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
                  <div className="label truncate mb-2.5">{n.title}</div>
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
        <Metrique n={note.nbCartes ?? f.cartes} l="cartes" />
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
   * les ancres sur chaque titre (`markdown.mjs`), autant les relire. Les H2
   * font les grandes parties, les H3 les sous-parties rattachées à celle qui
   * précède — `SpecNav` ne déplie que celles de la partie où l'on lit.
   */
  const html = note ? text?.[note.id]?.html : undefined
  const sections: SpecSection[] = useMemo(() => {
    if (!html) return []
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const out: SpecSection[] = []
    for (const h of doc.querySelectorAll('h2[id], h3[id]')) {
      const s: SpecSection = { id: h.id, label: (h.textContent ?? '').trim() }
      const partie = out[out.length - 1]
      // Un H3 avant le premier H2 n'a pas de parent : il tient lieu de partie.
      if (h.tagName === 'H3' && partie) partie.children = [...(partie.children ?? []), s]
      else out.push(s)
    }
    return out
  }, [html])

  const active = useScrollSpy(useMemo(() => specIds(sections), [sections]))

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

        {/* Les cartes de cette fiche-là, jouables d'ici : le bouton ne mène pas
            à l'écran de sélection, il lance la session sur ce seul paquet. */}
        <Reviser note={note} />

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
              <Metrique n={note.nbCartes ?? f.cartes} l="cartes" />
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

/* ------------------------------------------------------------ réviser d'ici */

/**
 * Le bouton qui lance les cartes de *cette* fiche.
 *
 * Il annonce ce qu'il engage plutôt qu'un total : le nombre qui compte un soir
 * de révision, c'est ce qui est dû aujourd'hui, pas ce que la fiche contient.
 * Quand tout est à jour, le bouton ne fait pas semblant du contraire — il passe
 * en second plan et propose de tout revoir, ce qui est un autre geste.
 *
 * Les cartes (40 ko) et la progression (localStorage) arrivent après la page :
 * tant qu'elles ne sont pas là, le bouton affiche le compte de l'index, déjà
 * chargé. Aucune attente, et le libellé s'affine tout seul.
 */
function Reviser({ note }: { note: Note }) {
  const paquets = usePaquets()
  // Lues une fois : on ne révise pas depuis cette page, rien ne les fera bouger.
  const [perso] = useState(chargerPerso)
  const [prog] = useState(chargerProgression)

  const compte = useMemo(() => {
    if (!paquets) return null
    const p = fusionner(paquets, perso).find((x) => x.noteId === note.id)
    return p ? compter(p.cartes, prog) : { total: 0, neuves: 0, dues: 0, acquises: 0 }
  }, [paquets, perso, prog, note.id])

  // Ni cartes dans la fiche, ni cartes maison rattachées : pas de bouton.
  if (compte ? compte.total === 0 : !note.nbCartes) return null

  const lien = (go: 'dues' | 'toutes') =>
    `/cours/revision?paquet=${encodeURIComponent(note.id)}&go=${go}`

  // Rien de dû : le bouton principal n'aurait rien à lancer.
  if (compte && compte.dues === 0)
    return (
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          to={lien('toutes')}
          className="label px-5 py-3 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
        >
          Tout revoir ({compte.total})
        </Link>
        <span className="caption text-subtle">Cette fiche est à jour.</span>
      </div>
    )

  const dues = compte?.dues ?? note.nbCartes ?? 0

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link
        to={lien('dues')}
        className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
      >
        Réviser {dues} carte{dues > 1 ? 's' : ''}
      </Link>
      {compte && compte.total > compte.dues && (
        <Link to={lien('toutes')} className="caption text-subtle hover:text-foreground transition-colors">
          ou tout revoir ({compte.total})
        </Link>
      )}
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
