import { useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { Empty } from '../components/Layout'
import { MediaLayout } from '../components/MediaLayout'
import {
  SpecCanvas,
  SpecHero,
  SpecNav,
  SpecNavMobile,
  SpecPager,
  SpecRow,
  SwatchGrid,
  hexToRgb,
  useScrollSpy,
  type SpecSection,
} from '../components/Spec'
import { indexById, projectUrl, useNotesText, type Media, type VaultData } from '../lib/vault'

/* --------------------------------------------------------------------------
   Fiche projet — mise en page « charte de marque » :
   bandeau teinté, sommaire à gauche, aspects présentés un par un.
   Vaut pour tout projet, univers de référence comme dossier d'inspiration.
   -------------------------------------------------------------------------- */

/** Ce que montre chaque aspect. Sert de commentaire dans la colonne de droite. */
const ASPECT_NOTES: Record<string, string> = {
  branding:
    "Le logo, ses déclinaisons et les éléments de signature : ce qui reste reconnaissable quand tout le reste disparaît.",
  couleurs: "Les palettes déclarées par la marque et les couleurs réellement relevées dans les écrans.",
  ui: "Les écrans du produit tels qu'ils sont réellement affichés — hiérarchie, composants, densité.",
  ecrans: "Les écrans du produit tels qu'ils sont réellement affichés — hiérarchie, composants, densité.",
  flows: "Des parcours complets, écran par écran : onboarding, achat, paramètres.",
  site: "Le site public : pages marketing, mise en scène de la marque hors du produit.",
  web: "Le site public : pages marketing, mise en scène de la marque hors du produit.",
  produit: "Les visuels produit et les mises en situation officielles.",
  'character-design': "Les personnages et mascottes, leurs expressions et leurs déclinaisons.",
  illustrations: "Le système d'illustration : trait, couleurs, mise en scène, niveau de détail.",
  animations: "Les séquences animées : trailers, démos, micro-interactions.",
  campagnes: "Les prises de parole publicitaires et les campagnes de marque.",
  photographie: "Le traitement photo : cadrage, lumière, direction artistique.",
  marketing: "Les visuels de promotion : stores, réseaux, publicités.",
  composants: "Des blocs d'interface isolés, sortis de leur page.",
  gameplay: "Le produit en action, capté tel qu'il se joue ou s'utilise.",
  typographie: "Les polices de la marque et leur mise en œuvre.",
}

const aspectLabel = (name: string) => name.replace(/-/g, ' ')

/** Résumé factuel d'un lot de médias : nombre de fichiers et formats présents. */
function mediaMeta(items: Media[]) {
  const exts = [...new Set(items.map((m) => m.ext.replace('.', '').toUpperCase()))].sort()
  return `${items.length} fichier${items.length > 1 ? 's' : ''} · ${exts.join(' · ')}`
}

/** Nombre de visuels montrés d'emblée dans un aspect, avant dépliage. */
const PREVIEW = 10

export function ProjetDetail({ data }: { data: VaultData }) {
  const { discipline, slug } = useParams()
  const idx = useMemo(() => indexById(data), [data])
  const u = data.projects.find((x) => x.discipline === discipline && x.slug === slug)

  const palette = useMemo(() => (u?.couleurs ?? []).filter((c) => hexToRgb(c)), [u])

  /** Un aspect = une rangée. On résout les médias une fois pour toutes. */
  const rows = useMemo(
    () =>
      (u?.aspects ?? []).map((a) => ({
        ...a,
        items: a.media.map((id) => idx.media.get(id)!).filter(Boolean),
      })),
    [u, idx]
  )

  const note = u?.noteId ? idx.notes.get(u.noteId) : null

  const sections: SpecSection[] = useMemo(() => {
    const s: SpecSection[] = []
    if (palette.length) s.push({ id: 'palette', label: 'palette', count: palette.length })
    for (const r of rows) s.push({ id: `aspect-${r.name}`, label: aspectLabel(r.name), count: r.count })
    if (note) s.push({ id: 'fiche', label: 'la fiche' })
    return s
  }, [palette.length, rows, note])

  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const active = useScrollSpy(ids)

  /**
   * Projet précédent / suivant, dans l'ordre de la liste des univers. On boucle
   * (le dernier renvoie au premier) pour pouvoir tourner indéfiniment entre les
   * projets sans jamais tomber sur une flèche morte.
   */
  const { prev, next } = useMemo(() => {
    // On tourne d'abord entre les projets de la même discipline ; s'il n'y en a
    // qu'un, on ouvre la boucle à tout le vault plutôt que d'afficher des
    // flèches mortes.
    const same = data.projects.filter((x) => x.discipline === discipline)
    const list = same.length > 1 ? same : data.projects
    const i = list.findIndex((x) => x.discipline === discipline && x.slug === slug)
    if (i < 0 || list.length < 2) return { prev: null, next: null }
    const at = (n: number) => {
      const x = list[(n + list.length) % list.length]
      return { to: projectUrl(x), title: x.title }
    }
    return { prev: at(i - 1), next: at(i + 1) }
  }, [data.projects, discipline, slug])

  if (!u)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Projet introuvable" hint="Le dossier a peut-être été renommé. Relance npm run index." />
      </div>
    )

  const cover = u.cover ? idx.media.get(u.cover) : null
  const tint = palette[0] ?? null
  const aspectList = rows.map((r) => aspectLabel(r.name)).join(', ')

  return (
    <>
      <SpecHero
        eyebrow={[u.disciplineLabel, u.categorie, u.secteur].filter(Boolean).join(' · ')}
        title={u.title}
        desc={
          rows.length
            ? `${u.count} visuels rapatriés en pleine qualité, rangés en ${rows.length} aspects : ${aspectList}.`
            : undefined
        }
        tint={tint}
        art={cover?.kind === 'image' ? cover.url : null}
        pager={<SpecPager prev={prev} next={next} />}
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            {u.source && (
              <a
                href={u.source}
                target="_blank"
                rel="noreferrer"
                className="label rounded-full border border-current/35 px-4 py-2.5 transition-opacity hover:opacity-70"
              >
                Source ↗
              </a>
            )}
            {u.annee && (
              <span className="caption rounded-lg border border-current/20 px-3 py-2.5" style={{ opacity: 0.8 }}>
                {u.annee}
              </span>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-12 pb-28">
        <SpecNavMobile sections={sections} active={active} />

        <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[196px_minmax(0,1fr)]">
          <SpecNav title={u.title} sections={sections} active={active} tint={tint} />

          <div className="min-w-0">
            {palette.length > 0 && (
              <SpecRow
                first
                id="palette"
                eyebrow={u.title}
                title="Palette"
                notes={[
                  u.couleurPrincipale
                    ? `La couleur de tête est le ${u.couleurPrincipale}. Les suivantes sont classées par importance décroissante dans l'identité.`
                    : 'Les couleurs sont classées par importance décroissante dans l’identité.',
                  'Cliquer sur un code copie sa valeur hexadécimale.',
                ]}
                meta={`${palette.length} couleurs`}
              >
                <SpecCanvas>
                  <SwatchGrid colors={palette} />
                </SpecCanvas>
              </SpecRow>
            )}

            {rows.map((r, i) => (
              <SpecRow
                key={r.name}
                first={i === 0 && palette.length === 0}
                id={`aspect-${r.name}`}
                eyebrow={u.title}
                title={aspectLabel(r.name)}
                notes={[ASPECT_NOTES[r.name] ?? 'Les visuels rapatriés pour cet aspect de l’univers.']}
                meta={r.items.length ? mediaMeta(r.items) : undefined}
              >
                <SpecCanvas>
                  <MediaLayout items={r.items} preview={PREVIEW} />
                </SpecCanvas>
              </SpecRow>
            ))}

            {note && (
              <SpecRow
                id="fiche"
                first={false}
                eyebrow={u.title}
                title="La fiche"
                notes={['La note du vault : sources, crédits, mots-clés et tout ce qui a été noté à la main.']}
              >
                <div className="max-w-3xl">
                  <NoteBody id={note.id} />
                </div>
              </SpecRow>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Le corps d'une note.
 *
 * Le HTML ne vient pas de l'index principal : il vit dans `/vault-notes.json`,
 * chargé en tâche de fond après le premier écran (il pesait à lui seul plus que
 * tout le reste de l'index). D'où le squelette le temps qu'il arrive — en
 * pratique il est déjà là, le préchargement au repos ayant eu lieu bien avant.
 *
 * Le HTML vient de notre propre indexeur (contenu local), pas d'une source tierce.
 */
export function NoteBody({ id }: { id: string }) {
  const text = useNotesText()
  const html = text?.[id]?.html
  if (html === undefined)
    return (
      <div className="space-y-3 animate-pulse" aria-hidden>
        <div className="h-4 w-2/3 rounded bg-surface" />
        <div className="h-4 w-full rounded bg-surface" />
        <div className="h-4 w-5/6 rounded bg-surface" />
      </div>
    )
  return <div className="prose-vault" dangerouslySetInnerHTML={{ __html: html }} />
}
