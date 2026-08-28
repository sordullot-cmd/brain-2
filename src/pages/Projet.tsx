import { useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Empty } from '../components/Layout'
import { useDockPager } from '../components/Dock'
import { MediaLayout } from '../components/MediaLayout'
import { useLightbox } from '../components/Lightbox'
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
import { displaySrc, indexById, projectUrl, useNotesText, type Media, type VaultData } from '../lib/vault'

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
  'logo-app': "L’icône de l’app, telle qu’elle apparaît sur l’écran d’accueil : le logo réduit à ce qui tient dans un carré.",
}

/**
 * Libellés qu'un simple remplacement de tirets ne rendrait pas : « logo-app »
 * donnerait « logo app ». Le nom de l'aspect reste le slug (il sert d'ancre).
 */
const ASPECT_LABELS: Record<string, string> = {
  'logo-app': 'logo de l’app',
}

const aspectLabel = (name: string) => ASPECT_LABELS[name] ?? name.replace(/-/g, ' ')

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
   * Projet précédent / suivant, dans l'ordre de l'index des projets. On boucle
   * (le dernier renvoie au premier) pour pouvoir tourner indéfiniment entre les
   * projets sans jamais tomber sur une flèche morte.
   *
   * La boucle passe par TOUS les projets, sans distinction : un univers de
   * référence et un dossier d'inspiration sont la même chose (un dossier, une
   * fiche, des médias rangés par aspect), et les flèches ne doivent pas
   * enfermer la navigation dans une discipline.
   */
  const { prev, next } = useMemo(() => {
    const list = data.projects
    const i = list.findIndex((x) => x.discipline === discipline && x.slug === slug)
    if (i < 0 || list.length < 2) return { prev: null, next: null }
    const at = (n: number) => {
      const x = list[(n + list.length) % list.length]
      // Deux projets peuvent porter le même nom dans deux disciplines (Kraken
      // en univers et en UI design) : on précise laquelle, sinon les deux
      // flèches affichent le même mot.
      const homonyme = list.some((y) => y !== x && y.title === x.title)
      return { to: projectUrl(x), title: homonyme ? `${x.title} · ${x.disciplineLabel}` : x.title }
    }
    return { prev: at(i - 1), next: at(i + 1) }
  }, [data.projects, discipline, slug])

  // Les memes fleches reprises par la barre flottante : le bandeau sort de
  // l'ecran des le premier ecran de scroll, et une fiche fait plusieurs
  // hauteurs d'ecran — sans ca il faut remonter tout en haut pour changer de
  // projet. Appele avant le `return` anticipe : un hook ne se saute pas.
  useDockPager(prev, next)

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
        // Le derive suffit pour un visuel pose dans le bandeau : les icones de
        // projet montent a 780 Ko en original, pour 300 px a l'ecran.
        art={cover?.kind === 'image' ? displaySrc(cover, 'view') : null}
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
                  <NoteBody id={note.id} media={idx.media} />
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
export function NoteBody({ id, media }: { id: string; media?: Map<string, Media> }) {
  const text = useNotesText()
  const { onClick, node } = useProseLightbox(media)
  const html = text?.[id]?.html
  if (html === undefined)
    return (
      <div className="space-y-3 animate-pulse" aria-hidden>
        <div className="h-4 w-2/3 rounded bg-surface" />
        <div className="h-4 w-full rounded bg-surface" />
        <div className="h-4 w-5/6 rounded bg-surface" />
      </div>
    )
  return (
    <>
      <div className="prose-vault" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {node}
    </>
  )
}

/**
 * Les visuels posés DANS le texte d'une note s'ouvrent en grand, comme ceux
 * d'une planche : c'est le même geste, et rien ne justifiait que le visuel d'une
 * fiche soit le seul du site à ne pas répondre au clic.
 *
 * L'ordre des flèches vient du DOM, pas de `note.media` : cette liste contient
 * aussi les fichiers seulement CITÉS (liens), donc les rangs ne correspondraient
 * pas à ce qui est affiché. Les visuels sont marqués `data-media` par
 * l'indexeur, ce qui suffit à retrouver le média complet.
 */
function useProseLightbox(media?: Map<string, Media>) {
  const [visuels, setVisuels] = useState<Media[]>([])
  const { openAt, node } = useLightbox(visuels)

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!media) return
    const cible = (e.target as HTMLElement).closest('[data-media]')
    if (!cible || !e.currentTarget.contains(cible)) return

    // On reconstruit la liste au clic : le HTML de la note arrive après coup, et
    // ses images peuvent encore être en cours de chargement au premier rendu.
    const items: Media[] = []
    let rang = -1
    for (const el of e.currentTarget.querySelectorAll('[data-media]')) {
      const m = media.get(el.getAttribute('data-media') ?? '')
      if (!m) continue
      if (el === cible) rang = items.length
      items.push(m)
    }
    if (rang < 0) return

    e.preventDefault()
    setVisuels(items)
    openAt(rang)
  }

  return { onClick, node }
}
