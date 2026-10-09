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
  /**
   * Nombre de cartes de révision extraites de sa section « Cartes à créer »
   * (voir `scripts/flashcards.mjs`). Absent quand la note n'en porte aucune ;
   * les cartes elles-mêmes sont dans `/vault-cartes.json`, chargé à part.
   */
  nbCartes?: number
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
  /**
   * Comment poser la cover dans une vignette : `cover` remplit le cadre (un key
   * art, un écran large), `contain` la montre en entier sur le fond (un logo,
   * une capture d'écran mobile — les recadrer les décapite).
   */
  coverFit: 'cover' | 'contain'
  couleurs: string[]
  couleurPrincipale: string | null
  categorie: string | null
  secteur: string | null
  annee: string | null
  source: string | null
  /** Les tags du vocabulaire contrôlé, à plat et rangés par ordre de facette. */
  tags: string[]
  /** Les mêmes, séparés par facette — c'est ce que la barre de filtres déroule. */
  facettes: Record<Facette, string[]>
  /** Les 2-3 tags les plus distinctifs, calculés à l'indexation. */
  topTags: string[]
  /** Date de dernière modification (fiche ou média), en ms — tri par fraîcheur. */
  mtime: number
}

/**
 * Les quatre facettes du vocabulaire de tags des projets — voir
 * `scripts/tags-projets.mjs`, qui en est la source. Chaque tag appartient à une
 * facette et à une seule : de quoi ça parle, ce que le produit fait, le parti
 * pris de design qu'on vient y étudier, à quoi ça ressemble.
 */
export type Facette = 'domaine' | 'sujet' | 'procede' | 'style'

export interface FacetteProjets {
  cle: Facette
  label: string
  tags: { name: string; count: number }[]
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

/**
 * Une fiche de livre du vault (`type: livre`), relevée par l'indexeur : ses
 * propriétés, et ce qu'elle retient section par section — c'est ce que la page
 * /livres fait remonter tous livres confondus.
 */
export interface Livre {
  /** Livre ajouté depuis le site : son id dans la table Supabase `livres`. */
  id?: string
  /** Livre venu d'une fiche du vault : l'id de la note. */
  noteId: string | null
  titre: string
  auteur: string | null
  statut: 'à lire' | 'en cours' | 'lu'
  genre: string | null
  /** Sur 5, une fois lu. */
  note: number | null
  /** Dates `AAAA-MM-JJ`. */
  ajoute: string | null
  debut: string | null
  fin: string | null
  recommandePar: string | null
  /** Une image du vault (`media`) ou une adresse externe (`url`). */
  couverture: { media?: string; url?: string } | null
  phrase: string | null
  appris: string[]
  appliquer: { texte: string; fait: boolean }[]
  citations: string[]
  mtime: number
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
  /** Les tags portés par les projets, une entrée par facette (voir `Facette`). */
  facettesProjets: FacetteProjets[]
  disciplines: Discipline[]
  /** Absent d'un index produit avant la page /livres. */
  livres?: Livre[]
  tags: { name: string; count: number }[]
}

let cache: VaultData | null = null

export async function loadVault(): Promise<VaultData> {
  if (cache) return cache
  const res = await fetch('/vault.json')
  if (!res.ok) throw new Error(`Index du vault introuvable (${res.status}). Lance "npm run index".`)
  cache = (await res.json()) as VaultData
  titrerLesCours(cache)
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
/** Les fiches condensées de /condense : un PDF à télécharger, pas une page de plus. */
const CONDENSES = '_condenses'
/** Les cartes des priorités de /priorites, une par UE : un PDF à télécharger aussi. */
const PRIORITES = '_priorites'

/**
 * Le PDF condensé d'une fiche, s'il existe : même nom, dans `_condenses/` à
 * côté d'elle (voir le skill /condense du vault).
 */
export function condenseDe(note: Note, media: Map<string, Media>): Media | null {
  const i = note.path.lastIndexOf('/')
  const pdf = `${note.path.slice(0, i + 1)}${CONDENSES}/${note.path.slice(i + 1).replace(/\.md$/, '.pdf')}`
  return media.get(pdf) ?? media.get(pdf.normalize('NFC')) ?? null
}

/**
 * Le PDF des priorités d'une UE (carte des priorités + annexe « Réviser avec
 * une IA »), s'il existe : `eco gestion/_priorites/UE <ue> - <matière>.pdf`
 * (voir le skill /priorites du vault).
 */
export function prioritesDe(ue: string | null, media: Map<string, Media>): Media | null {
  if (!ue) return null
  const debut = `${COURS_DOMAIN}/${PRIORITES}/UE ${ue} - `.normalize('NFC')
  for (const m of media.values()) {
    if (m.ext === 'pdf' && m.path.normalize('NFC').startsWith(debut)) return m
  }
  return null
}

/**
 * Une note de cours s'appelle comme son fichier.
 *
 * L'indexeur titre une note par son H1 (le nom de fichier n'est que son dernier
 * recours), ce qui va bien partout ailleurs. Dans `eco gestion`, non : les H1
 * sont des titres de lecture, décorés et longs — « 📘 Cours — Qu'est-ce que la
 * science économique ? Objet et méthode (UE 11A) » — quand le nom de fichier est
 * le nom court, stable et triable qui sert à ranger le semestre et à s'y
 * retrouver dans Obsidian, où c'est lui la vraie identité d'une note. Le pire
 * cas décidait à lui seul : `gestion.md` s'affichait « deployer des ressorces
 * pour atteindre ses objectifs », sa première ligne de titre.
 *
 * On réécrit donc le titre à la lecture de l'index plutôt que dans l'indexeur :
 * le dossier de cours reste nommé une seule fois, dans `COURS_DOMAIN`. Un
 * `title:` posé à la main dans le frontmatter reste prioritaire — c'est un choix
 * explicite, pas un H1 de mise en page.
 */
function titrerLesCours(d: VaultData) {
  for (const n of d.notes) {
    if (n.domain !== COURS_DOMAIN) continue
    if (typeof n.frontmatter.title === 'string' && n.frontmatter.title.trim()) continue
    n.title = n.stem
  }
}

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
  const toutes = d.notes.filter(
    (n) =>
      n.domain === COURS_DOMAIN &&
      !n.folder.split('/').some((d) => d === CONDENSES || d === PRIORITES)
  )
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

/* ------------------------------------------------------------------ matières

   Un cours s'étale sur plusieurs fichiers — la gestion en compte quatre, un par
   chapitre — et ses notes d'amphi brutes vivent à part, dans `_brut/`. Lus
   fichier par fichier, ça fait une page de cartes éparpillées où le même cours
   revient cinq fois. On regroupe donc par UE : une matière, ses chapitres dans
   l'ordre, et les notes brutes qui en parlent.
   -------------------------------------------------------------------------- */

export interface Matiere {
  ue: string
  /** Nom du cours : « Gestion », « Problèmes économiques »… */
  nom: string
  coef: number | null
  periode: number | null
  cycle: string | null
  /** Les fiches d'UE, dans l'ordre où le plan les cite. */
  chapitres: Note[]
  /** Les notes d'amphi brutes qui portent sur ce cours. */
  brut: Note[]
}

/**
 * Les noms de fichiers sont sans accents (ils doivent rester sûrs partout) ;
 * le site, lui, les affiche. Seuls les préfixes de cours sont concernés.
 */
const ACCENTS: Record<string, string> = {
  economie: 'Économie',
  'problemes economiques': 'Problèmes économiques',
  methodologie: 'Méthodologie',
}

/** Le préfixe du nom de fichier, avant « - » : « Gestion », « Economie »… */
const prefixe = (n: Note) => n.stem.split(' - ')[0].trim()

/** Le nom d'un cours : `matiere:` en frontmatter, sinon le préfixe du fichier. */
function nomMatiere(n: Note) {
  const fm = texte(n.frontmatter.matiere)
  if (fm) return fm
  const p = prefixe(n)
  return ACCENTS[norm(p)] ?? p
}

/**
 * Le titre d'un chapitre sans ce que la carte du cours dit déjà : le nom du
 * cours devant, le code d'UE derrière. « Gestion - Partie 2 Strategie et
 * environnement UE 12A » devient « Partie 2 Strategie et environnement ».
 */
export function titreChapitre(n: Note) {
  const t = n.title.includes(' - ') ? n.title.slice(n.title.indexOf(' - ') + 3) : n.title
  return t.replace(/\s+UE\s+\w+$/i, '').trim() || n.title
}

/**
 * Les cours, une entrée par UE, dans l'ordre où ils tombent. `orphelines` : les
 * notes brutes qu'aucun cours ne réclame.
 */
export function matieres(d: VaultData): { liste: Matiere[]; orphelines: Note[] } {
  const { fiches, brut } = coursSections(d)

  // L'ordre des chapitres est celui du plan (la note taguée `hub`) : c'est là
  // qu'il est écrit, ligne par UE. Ce que le plan ne cite pas passe après, par titre.
  const hub = d.notes.find((n) => n.domain === COURS_DOMAIN && n.tags.includes('hub'))
  const rangPlan = (n: Note) => {
    const i = hub?.links.indexOf(n.id) ?? -1
    return i < 0 ? Infinity : i
  }

  const map = new Map<string, Matiere>()
  for (const n of fiches) {
    const f = fiche(n)
    const ue = f.ue!
    let m = map.get(ue)
    if (!m) {
      m = { ue, nom: nomMatiere(n), coef: null, periode: null, cycle: null, chapitres: [], brut: [] }
      map.set(ue, m)
    }
    m.chapitres.push(n)
    if (f.coef !== null) m.coef = Math.max(m.coef ?? 0, f.coef)
    if (f.periode !== null) m.periode = Math.min(m.periode ?? Infinity, f.periode)
    m.cycle ??= cycleDe(n)
  }

  const liste = [...map.values()]
  for (const m of liste)
    m.chapitres.sort((a, b) => rangPlan(a) - rangPlan(b) || a.title.localeCompare(b.title))

  // Une note brute va au cours dont elle cite le nom — le plus long qui colle,
  // pour que « Problèmes économiques contemporains » n'aille pas en « Économie ».
  const orphelines: Note[] = []
  for (const n of brut) {
    const t = norm(n.title)
    const cible = liste
      .filter((m) => t.includes(norm(m.nom)) || new RegExp(`\\b${norm(m.ue)}\\b`).test(t))
      .sort((a, b) => b.nom.length - a.nom.length)[0]
    if (cible) cible.brut.push(n)
    else orphelines.push(n)
  }

  liste.sort(
    (a, b) =>
      (a.periode ?? 99) - (b.periode ?? 99) ||
      (b.coef ?? 0) - (a.coef ?? 0) ||
      a.ue.localeCompare(b.ue)
  )
  return { liste, orphelines }
}

/** Le cycle d'une note, lu dans ses tags (`cycle-3` → « cycle 3 »). */
export const cycleDe = (n: Note) => n.tags.find((t) => /^cycle-\d+$/.test(t))?.replace('-', ' ') ?? null

/** Lien vers une note lue dans la section cours. */
export const coursUrl = (n: Note) => `/cours/${n.id.split('/').map(encodeURIComponent).join('/')}`

/** Lien vers une note lue dans la section notes. */
export const noteUrl = (n: Note) => `/note/${n.id.split('/').map(encodeURIComponent).join('/')}`
