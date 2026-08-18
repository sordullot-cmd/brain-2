/**
 * Chargement de l'index du vault (public/vault.json, produit par
 * scripts/index-vault.mjs) et petits helpers de lecture.
 */

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
  html: string
  excerpt: string
  search: string
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

/** Lien vers la fiche d'un projet. */
export const projectUrl = (p: Project) => `/projet/${p.discipline}/${p.slug}`

/** Notes réellement rédigées par Sacha (hors templates et doc technique). */
export const contentNotes = (d: VaultData) => d.notes.filter((n) => !n.isMeta)
