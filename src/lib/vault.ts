/**
 * Chargement de l'index du vault (public/vault.json, produit par
 * scripts/index-vault.mjs) et petits helpers de lecture.
 */

import { useEffect, useState } from 'react'

export type MediaKind = 'image' | 'video' | 'audio' | 'doc' | 'other'

export interface Media {
  id: string
  path: string
  url: string
  name: string
  stem: string
  ext: string
  kind: MediaKind
  folder: string
  size: number
  mtime: number
  /** Dimensions natives, quand l'indexeur a su les lire (images seulement). */
  w?: number
  h?: number
  /**
   * Dérivés WebP produits à l'indexation (`scripts/derivatives.mjs`). `mini`
   * pour les tuiles de grille, `thumb` pour les planches, `view` pour la
   * visionneuse. Absents pour les petits SVG (déjà légers) ; une vidéo a un
   * `thumb` (son image d'affiche) et un `preview` (le MP4 recompressé).
   * `url` reste l'original, à ne charger que sur demande explicite.
   */
  mini?: string
  thumb?: string
  view?: string
  /** MP4 web (960 px, CRF 30, faststart) — ce qui est réellement lu dans la page. */
  preview?: string
  /** Dimensions du `thumb`, pour réserver la place et éviter les sauts. */
  dw?: number
  dh?: number
  /**
   * Visuel « à rallonge » (page exportée d'un seul tenant) : ses tranches, dans
   * l'ordre, à empiler pour le lire. Voir `BANDE` dans derivatives.mjs — un seul
   * fichier ne peut ni rester lisible ni dépasser 16383 px de côté.
   */
  bande?: string[]
  /** Dimensions de la bande entière, tranches empilées. */
  bw?: number
  bh?: number
}

export interface Note {
  id: string
  path: string
  slug: string
  name: string
  stem: string
  title: string
  folder: string
  domain: string
  isIndex: boolean
  isMeta: boolean
  frontmatter: Record<string, unknown>
  type: string | null
  /**
   * Rendus lourds : servis à part dans `/vault-notes.json`, chargés en tâche de
   * fond (voir `loadNotesText`). Toujours absents de l'index principal.
   */
  html?: string
  excerpt: string
  search?: string
  mtime: number
  size: number
  tags: string[]
  links: string[]
  backlinks: string[]
  media: string[]
}

export interface Aspect {
  name: string
  count: number
  media: string[]
}

/**
 * Un projet = un dossier d'inspiration, univers compris. Les deux avaient leur
 * page ; ils partagent désormais un index unique, filtrable par discipline et
 * par tag.
 */
export interface Project {
  /** `DISCIPLINE/slug`, ex. `UI-DESIGN/kraken` — unique dans tout le vault. */
  id: string
  slug: string
  discipline: string
  disciplineLabel: string
  kind: 'univers' | 'inspiration'
  title: string
  noteId: string | null
  count: number
  /** Poids des originaux du projet, planches exclues — comme `count`. */
  bytes: number
  aspects: Aspect[]
  cover: string | null
  couleurs: string[]
  couleurPrincipale: string | null
  categorie: string | null
  secteur: string | null
  annee: string | null
  source: string | null
  tags: string[]
  /** Les 2-3 tags les plus distinctifs, calculés à l'indexation. */
  topTags: string[]
  /** Date de dernière modification (fiche ou média), en ms — tri par fraîcheur. */
  mtime: number
}

export interface Discipline {
  name: string
  label: string
  path: string
  mediaCount: number
  noteCount: number
  projectCount: number
  indexId: string | null
  media: string[]
  notes: string[]
}

export interface VaultData {
  generatedAt: string
  vaultPath: string
  vaultName: string
  stats: {
    notes: number
    notesTotal: number
    media: number
    images: number
    videos: number
    tags: number
    projects: number
    universes: number
    disciplines: number
    bytes: number
  }
  notes: Note[]
  media: Media[]
  projects: Project[]
  disciplines: Discipline[]
  tags: { name: string; count: number }[]
}

let cache: VaultData | null = null

export async function loadVault(): Promise<VaultData> {
  if (cache) return cache
  const res = await fetch('/vault.json')
  if (!res.ok) throw new Error(`Index du vault introuvable (${res.status}). Lance "npm run index".`)
  cache = (await res.json()) as VaultData
  return cache
}

/* -------------------------------------------------- texte des notes (différé)

   Le HTML rendu et le texte de recherche pèsent plus que tout le reste de
   l'index. Deux pages seulement en ont besoin : on les charge à part, en tâche
   de fond dès que la première page est peinte, si bien que la navigation les
   trouve presque toujours déjà là.
   -------------------------------------------------------------------------- */

export type NotesText = Record<string, { html: string; search: string }>

let textCache: NotesText | null = null
let textPromise: Promise<NotesText> | null = null

export function loadNotesText(): Promise<NotesText> {
  textPromise ??= fetch('/vault-notes.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: NotesText) => {
      textCache = j
      return j
    })
    .catch(() => {
      // Pas de texte : les listes et les grilles restent utilisables.
      textPromise = null
      return {}
    })
  return textPromise
}

/** Déclenche le chargement sans attendre le résultat (appelé au repos). */
export const prefetchNotesText = () => void loadNotesText()

/** Le texte déjà en mémoire, ou `null` s'il n'est pas encore arrivé. */
export const notesTextNow = () => textCache

/** Rend le texte des notes disponible dans un composant, en le chargeant au besoin. */
export function useNotesText(): NotesText | null {
  const [text, setText] = useState<NotesText | null>(textCache)
  useEffect(() => {
    if (textCache) return setText(textCache)
    let vivant = true
    loadNotesText().then((t) => vivant && setText(t))
    return () => {
      vivant = false
    }
  }, [])
  return text
}

/** Index par identifiant, pour résoudre médias et notes référencés. */
export function indexById(data: VaultData) {
  return {
    media: new Map(data.media.map((m) => [m.id, m])),
    notes: new Map(data.notes.map((n) => [n.id, n])),
  }
}

export const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} o`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`
  return `${(b / 1024 / 1024).toFixed(1)} Mo`
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Retire les accents et la casse, pour une recherche tolérante. */
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Source d'affichage d'un média : le dérivé s'il existe, l'original sinon (SVG,
 * ou dérivé qui a échoué). Jamais l'original quand un dérivé est disponible.
 */
export const displaySrc = (m: Media, size: 'mini' | 'thumb' | 'view' = 'thumb') =>
  m[size] ?? m.thumb ?? m.mini ?? m.url

/** Largeurs réelles des dérivés (miroir de `SIZES` dans derivatives.mjs). */
export const DERIVED_W = { mini: 400, thumb: 640, view: 1800 } as const

/**
 * Boîte du dérivé `view` (miroir de `SIZES.view`). Le dérivé est calculé en
 * `fit: inside` + `withoutEnlargement`, donc ces deux nombres suffisent à
 * retrouver combien de pixels le fichier affiché contient vraiment.
 */
export const VIEW_BOX = { w: 1800, h: 3600 } as const

/** Hauteur d'une tranche de bande (miroir de `BANDE.tranche` dans derivatives.mjs). */
export const BANDE_TRANCHE = 4000

/** Hauteur de la tranche `i` d'une bande : la dernière est plus courte. */
export const trancheH = (m: Media, i: number) =>
  Math.min(BANDE_TRANCHE, Math.max(1, (m.bh ?? 0) - i * BANDE_TRANCHE))

/**
 * Pixels réellement disponibles dans le visuel affiché par la visionneuse : le
 * dérivé `view` s'il existe (donc borné par `VIEW_BOX`), l'original sinon.
 * `null` quand les dimensions sont inconnues.
 */
export function viewPixels(m: Media): { w: number; h: number } | null {
  if (!m.w || !m.h) return null
  const k = m.view ? Math.min(1, VIEW_BOX.w / m.w, VIEW_BOX.h / m.h) : 1
  return { w: Math.round(m.w * k), h: Math.round(m.h * k) }
}

/**
 * `srcset` d'une tuile : le navigateur prend `mini` sur une petite tuile et
 * `thumb` sur un écran retina ou une tuile large, au lieu de charger 640 px
 * partout. `sizes` décrit la largeur d'affichage, pas celle du fichier.
 */
export function tileSrcSet(m: Media, sizes = '(max-width: 640px) 45vw, 200px') {
  if (!m.mini || !m.thumb) return { src: displaySrc(m, 'thumb'), srcSet: undefined, sizes: undefined }
  return {
    src: m.mini,
    srcSet: `${m.mini} ${DERIVED_W.mini}w, ${m.thumb} ${DERIVED_W.thumb}w`,
    sizes,
  }
}

/** La source à LIRE pour une vidéo : le dérivé web, jamais le master du vault. */
export const playSrc = (m: Media) => m.preview ?? m.url

/** Lien vers la fiche d'un projet. */
export const projectUrl = (p: Project) => `/projet/${p.discipline}/${p.slug}`

/** Notes réellement rédigées par Sacha (hors templates et doc technique). */
export const contentNotes = (d: VaultData) => d.notes.filter((n) => !n.isMeta)

/* -------------------------------------------------------------------- cours

   Le vault a un dossier de cours — les fiches d'UE de la licence — que rien ne
   distingue d'une note ordinaire dans /notes, alors qu'on n'y cherche pas la
   même chose : où j'en suis, ce qui tombe en premier, ce qu'il reste à
   récupérer. D'où /cours, et d'où ces lecteurs de frontmatter : chaque fiche
   porte ses métadonnées scolaires là (c'est ce qui alimente les tableaux
   Dataview dans Obsidian), l'indexeur les recopie telles quelles.
   -------------------------------------------------------------------------- */

/** Le dossier du vault qui tient les cours. */
export const COURS_DOMAIN = 'eco gestion'

/** Les notes d'amphi pas encore mises en fiche vivent dans ce sous-dossier. */
const BRUT = '_brut'

export interface Fiche {
  /** Code de l'unité d'enseignement, ex. `12A`. Une note sans `ue` n'est pas une fiche de cours. */
  ue: string | null
  notion: string | null
  coef: number | null
  periode: number | null
  statut: string | null
  /** Points listés dans le bloc « À vérifier / à récupérer » : du cours qui manque. */
  aVerifier: number
  cartes: number
  /** Dernier passage de revue, en ms. */
  revu: number | null
}

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Les métadonnées scolaires d'une note, lues dans son frontmatter. */
export function fiche(n: Note): Fiche {
  const f = n.frontmatter
  const revu = Date.parse(String(f.revu ?? ''))
  return {
    ue: texte(f.ue),
    notion: texte(f.notion),
    coef: nombre(f.coef),
    periode: nombre(f.periode),
    statut: texte(f.statut),
    aVerifier: nombre(f.a_verifier) ?? 0,
    cartes: nombre(f.cartes) ?? 0,
    revu: Number.isFinite(revu) ? revu : null,
  }
}

/**
 * Le dossier de cours, rangé par familles :
 *
 * - les **fiches d'UE** — celles qui portent un `ue`, donc un examen, un
 *   coefficient et une période ;
 * - les **chapitres** — taguées `cours` sans `ue` : les cours de méthode des
 *   cycles, qui préparent les UE sans être évalués pour eux-mêmes ;
 * - les **exercices** — taguées `exercices`, où l'on refait plutôt qu'on relit ;
 * - les **pages** qui entourent le tout : plan, cycles, MCC, ressources ;
 * - les **notes d'amphi** encore brutes.
 *
 * Les fiches sortent dans l'ordre où elles tombent — période, puis poids —
 * parce que c'est l'ordre dans lequel on les révise.
 */
export function coursSections(d: VaultData) {
  const toutes = d.notes.filter((n) => n.domain === COURS_DOMAIN)
  const brut = toutes.filter((n) => n.folder.split('/').includes(BRUT))
  const rangees = toutes.filter((n) => !n.folder.split('/').includes(BRUT))

  const fiches = rangees
    .filter((n) => fiche(n).ue)
    .sort((a, b) => {
      const x = fiche(a)
      const y = fiche(b)
      return (
        (x.periode ?? 99) - (y.periode ?? 99) ||
        (y.coef ?? 0) - (x.coef ?? 0) ||
        a.title.localeCompare(b.title)
      )
    })

  const parTitre = (a: Note, b: Note) =>
    Number(b.isIndex) - Number(a.isIndex) || a.title.localeCompare(b.title)

  const reste = rangees.filter((n) => !fiche(n).ue)
  const chapitres = reste.filter((n) => n.tags.includes('cours')).sort(parTitre)
  const exercices = reste.filter((n) => !n.tags.includes('cours') && n.tags.includes('exercices')).sort(parTitre)
  const pages = reste
    .filter((n) => !n.tags.includes('cours') && !n.tags.includes('exercices'))
    .sort(parTitre)

  return {
    toutes,
    fiches,
    chapitres,
    exercices,
    pages,
    brut: [...brut].sort((a, b) => b.mtime - a.mtime),
  }
}

/** Le cycle d'une note, lu dans ses tags (`cycle-3` → « cycle 3 »). */
export const cycleDe = (n: Note) => n.tags.find((t) => /^cycle-\d+$/.test(t))?.replace('-', ' ') ?? null

/** Lien vers une note lue dans la section cours. */
export const coursUrl = (n: Note) => `/cours/${n.id.split('/').map(encodeURIComponent).join('/')}`

/** Lien vers une note lue dans la section notes. */
export const noteUrl = (n: Note) => `/note/${n.id.split('/').map(encodeURIComponent).join('/')}`
