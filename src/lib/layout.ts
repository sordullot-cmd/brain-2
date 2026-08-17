/**
 * Composition des visuels d'un aspect, calee sur design.duolingo.com.
 *
 * Trois regles, et pas une de plus :
 *
 *   1. **une ligne remplit toujours toute la largeur.** Un visuel seul prend
 *      tout ; jamais de vide sur le cote, jamais une moitie de ligne.
 *   2. **les cellules d'une meme ligne sont identiques**, et toutes les lignes
 *      d'un meme lot ont la meme hauteur — une ligne plus courte elargit ses
 *      cellules au lieu de grandir. Le visuel est centre et contenu dedans.
 *   3. **la variation vient du contenu, pas de l'envie de varier** : une serie
 *      (meme famille de nom, ou meme format) reste groupee, et le nombre de
 *      cellules par ligne suit le format des visuels — des bandes larges a trois
 *      de front, des illustrations a deux ou trois, des ecrans verticaux a quatre.
 *
 * Le resultat est deterministe : meme dossier, meme mise en page.
 */
import type { Media } from './vault'

export type Row =
  /** Un visuel seul : il prend TOUTE la largeur, jamais la moitie. */
  | { kind: 'feature'; items: Media[] }
  /**
   * Une ligne de cellules IDENTIQUES qui remplit toute la largeur. `ratio` est
   * le format de la cellule — le meme pour toute la ligne, donc les hauteurs
   * sont egales par construction ; chaque visuel est centre dedans.
   */
  | { kind: 'grid'; items: Media[]; cols: number; ratio: number }

/** Format (largeur / hauteur). Faute de dimensions, on suppose 16:9 pour une video, 1:1 sinon. */
export function mediaRatio(m: Media): number {
  if (m.w && m.h) return m.w / m.h
  return m.kind === 'video' ? 16 / 9 : 1
}

/**
 * Visuels qui meritent d'ouvrir un aspect : la signature de la marque.
 * Pas de « main » ici : dans un vault francais c'est une main, pas « principal ».
 */
const SIGNATURE =
  /(^|[-_ ])(logo|logotype|logomark|wordmark|lockup|marque|primary|primaire|principal|hero|cover|key-?art|poster|affiche)([-_ ]|$)/i

/**
 * Une page de REGLE n'est pas une signature : une grille de construction, une
 * zone de protection ou un contre-exemple parle DU logo, il n'est pas le logo.
 * Ca ne s'ouvre donc pas en pleine largeur, meme si le nom contient « wordmark ».
 */
const REGLE = /(^|[-_ ])(construction|grille|clear-?space|do-?not|interdit|regle|proportions|placement|espacement)([-_ ]|$)/i

const isSignature = (stem: string) => SIGNATURE.test(stem) && !REGLE.test(stem)

/** Classe de format, pour regrouper les visuels de meme allure. */
const bucket = (r: number) => (r > 2.2 ? 0 : r > 1.3 ? 1 : r > 0.95 ? 2 : r > 0.7 ? 3 : 4)

/**
 * Cellules par ligne, selon le format des visuels du lot — comme sur
 * design.duolingo.com : des bandes tres larges se lisent a trois de front, des
 * illustrations 4:3 a deux, des ecrans verticaux a quatre.
 */
const colsPour = (r: number) => (r >= 2.6 ? 3 : r >= 1.3 ? 2 : r >= 0.8 ? 3 : 4)

/**
 * Format de cellule d'une ligne. Borne, sinon une bande 9:1 donne une cellule
 * de 40 px de haut et un ecran 0,4:1 une cellule interminable.
 */
const CELL_MIN = 0.45
const CELL_MAX = 4
const cellRatio = (items: Media[]) => {
  const rs = items.map(mediaRatio).sort((a, b) => a - b)
  const median = rs[(rs.length - 1) >> 1]
  return Math.min(CELL_MAX, Math.max(CELL_MIN, median))
}

/**
 * Decoupe `n` visuels en lignes d'au plus `cols` cellules, **sans orpheline** :
 * on fixe d'abord le nombre de lignes, puis on repartit au plus egal. 5 visuels
 * a 3 par ligne donnent 3+2, pas 3+1+1 — c'est ce qui evite les demi-lignes
 * vides sur le cote.
 */
/**
 * Colonnes retenues pour une serie de `n` visuels, a partir de la valeur que
 * suggere leur format. On privilegie un nombre qui **divise** la serie : toutes
 * les lignes ont alors la meme longueur, donc des cellules de meme taille du
 * haut en bas du lot — c'est ce qui evite le saut de taille d'une ligne de 3
 * suivie d'une ligne de 2. A egalite, on prend le plus petit : des cellules plus
 * grandes se regardent mieux.
 */
export function colsSerie(n: number, suggere: number): number {
  if (n <= suggere) return n
  // Jamais MOINS de colonnes que le format n'en demande : ce serait des cellules
  // enormes pour un petit visuel. Une colonne de plus, en revanche, est un bon
  // echange si elle fait tomber la serie juste.
  const exact = [suggere, suggere + 1].filter((c) => c <= 4 && n % c === 0)
  return exact.length ? exact[0] : suggere
}

export function repartir(n: number, cols: number): number[] {
  if (n <= cols) return [n]
  let lignes = Math.ceil(n / cols)
  // Jamais de ligne a un seul visuel au milieu d'une serie : on retire une ligne
  // et on accepte une cellule de plus quelque part. 13 a 2 par ligne donnent
  // 3+2+2+2+2+2, pas 2x6 + 1 tout seul.
  while (lignes > 1 && Math.floor(n / lignes) < 2) lignes--
  const base = Math.floor(n / lignes)
  const reste = n % lignes
  return Array.from({ length: lignes }, (_, i) => base + (i < reste ? 1 : 0))
}

/** Deux visuels sont « de la meme serie » si leur format est quasiment identique. */
const sameShape = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.06

/**
 * Famille d'un visuel : ce qu'il MONTRE, variante mise de cote — c'est ce qui
 * empeche d'afficher dix fois le meme logotype en pleine largeur parce qu'il est
 * decline en dix couleurs (`wordmark-noir`, `wordmark-violet-plus`…).
 *
 * On ne devine pas une liste de familles : on la deduit du dossier. La famille
 * d'un visuel est le plus LONG prefixe de son nom (en segments) partage par au
 * moins `MIN_FAMILLE` visuels ; a defaut son premier segment.
 */
/** Nombre de visuels a partir duquel un prefixe de nom vaut comme famille. */
const MIN_FAMILLE = 3
/** Deux visuels de la meme famille forment deja une serie : ils vont sur la meme ligne. */
const MIN_SERIE = 2

function familyKeys(items: Media[]): Map<Media, string> {
  const compte = new Map<string, number>()
  const segments = new Map<Media, string[]>()
  for (const m of items) {
    const segs = (m.stem || '').toLowerCase().split(/[-_ ]+/).filter(Boolean)
    segments.set(m, segs)
    for (let n = 1; n <= segs.length; n++) {
      const p = segs.slice(0, n).join('-')
      compte.set(p, (compte.get(p) ?? 0) + 1)
    }
  }
  const cles = new Map<Media, string>()
  for (const m of items) {
    const segs = segments.get(m) ?? []
    let cle = segs[0] ?? ''
    // du plus specifique au plus general : on garde le premier prefixe partage
    for (let n = segs.length; n >= 1; n--) {
      const p = segs.slice(0, n).join('-')
      if ((compte.get(p) ?? 0) >= MIN_FAMILLE) {
        cle = p
        break
      }
    }
    cles.set(m, cle)
  }
  return cles
}

/**
 * Longueur de la serie qui commence a `i` : meme famille de nom, ou a defaut
 * meme format. Une serie a droit a son propre quadrillage.
 */
function runLength(list: Media[], i: number, familles?: Map<Media, string>): number {
  const fam = familles?.get(list[i])
  if (fam) {
    let n = 1
    while (i + n < list.length && familles!.get(list[i + n]) === fam) n++
    if (n >= MIN_SERIE) return n
  }
  const r = mediaRatio(list[i])
  let n = 1
  while (i + n < list.length && sameShape(mediaRatio(list[i + n]), r)) n++
  return n
}

/**
 * Range les visuels avant de les composer : la signature en tete, puis les
 * formats regroupes — le format dominant d'abord, parce que c'est lui qui dit
 * de quoi l'aspect est fait (des ecrans pour l'UI, des icones pour le branding).
 * Tri stable, donc l'ordre d'origine survit a l'interieur d'un meme format
 * (ecran 01, 02, 03…).
 */
function arrange(items: Media[], familles: Map<Media, string>): Media[] {
  const list = items.map((m, i) => ({ m, i }))

  const weight = new Map<number, number>()
  for (const { m } of list) {
    const b = bucket(mediaRatio(m))
    weight.set(b, (weight.get(b) ?? 0) + 1)
  }

  // Rang d'une famille = sa premiere apparition, pour que l'ordre du dossier
  // survive et que les membres d'une meme famille finissent cote a cote.
  const rangFamille = new Map<string, number>()
  list.forEach(({ m, i }) => {
    const f = familles.get(m) ?? ''
    if (!rangFamille.has(f)) rangFamille.set(f, i)
  })

  list.sort((a, b) => {
    const ba = bucket(mediaRatio(a.m))
    const bb = bucket(mediaRatio(b.m))
    if (ba !== bb) {
      // Le plus represente passe devant ; a egalite, du plus large au plus haut.
      const d = (weight.get(bb) ?? 0) - (weight.get(ba) ?? 0)
      if (d !== 0) return d
      return ba - bb
    }
    const fa = rangFamille.get(familles.get(a.m) ?? '') ?? a.i
    const fb = rangFamille.get(familles.get(b.m) ?? '') ?? b.i
    if (fa !== fb) return fa - fb
    return a.i - b.i
  })

  const sorted = list.map((x) => x.m)

  // Le visuel de signature passe devant, s'il y en a un et qu'il n'y est pas deja.
  const hero = sorted.findIndex((m) => isSignature(m.stem) && mediaRatio(m) >= 0.95)
  if (hero > 0) {
    const [m] = sorted.splice(hero, 1)
    sorted.unshift(m)
  }

  return sorted
}

/**
 * Compose les visuels d'un aspect.
 *
 * Deux regles, et pas une de plus — c'est celles de design.duolingo.com :
 *   1. **une ligne remplit toujours toute la largeur.** Un visuel seul prend
 *      tout ; il n'y a jamais de vide sur le cote.
 *   2. **les cellules d'une meme ligne sont identiques.** Meme format donc
 *      meme hauteur, le visuel etant centre dedans.
 *
 * La variation se joue ENTRE les lignes (une pleine largeur, puis deux, puis
 * trois), pas a l'interieur d'une ligne — et elle vient du contenu : une serie
 * (meme famille de nom, ou meme format) reste groupee et se decoupe sans
 * orpheline.
 */
export function layoutMedia(items: Media[]): Row[] {
  if (!items.length) return []

  const familles = familyKeys(items)
  const list = arrange(items, familles)
  const rows: Row[] = []
  let i = 0

  /** Une ligne par tranche, cellules egales, aucune tranche a moitie vide. */
  const poser = (lot: Media[]) => {
    if (!lot.length) return
    if (lot.length === 1) {
      rows.push({ kind: 'feature', items: lot })
      return
    }
    // Un seul format de cellule pour tout le lot : les lignes se suivent sans
    // saut de taille, comme les quadrillages de design.duolingo.com.
    const ratio = cellRatio(lot)
    const cols = colsSerie(lot.length, colsPour(ratio))
    let k = 0
    for (const taille of repartir(lot.length, cols)) {
      const ligne = lot.slice(k, k + taille)
      k += taille
      if (ligne.length === 1) {
        rows.push({ kind: 'feature', items: ligne })
        continue
      }
      // Une ligne plus courte remplit quand meme toute la largeur : ses cellules
      // s'elargissent, mais gardent la MEME HAUTEUR que les autres lignes du lot
      // (le format de cellule suit le rapport de colonnes). Donc pas de vide sur
      // le cote, et pas de saut de taille d'une ligne a l'autre.
      rows.push({
        kind: 'grid',
        items: ligne,
        cols: ligne.length,
        ratio: (ratio * cols) / ligne.length,
      })
    }
  }

  // La signature ouvre l'aspect en pleine largeur — mais seulement si elle est
  // seule de son genre : dix declinaisons du meme logotype valent un quadrillage,
  // pas dix pleines largeurs (cas duolingo/branding, aout 2026).
  if (isSignature(list[0].stem) && list.length >= 3 && runLength(list, 0, familles) < MIN_SERIE) {
    rows.push({ kind: 'feature', items: [list[0]] })
    i = 1
  }

  // Les visuels qui n'appartiennent a aucune serie sont regroupes entre eux :
  // isoles, chacun reclamerait une pleine largeur pour rien.
  let seuls: Media[] = []
  while (i < list.length) {
    const run = runLength(list, i, familles)
    if (run >= MIN_SERIE) {
      // Un seul isole en attente ne fait pas une ligne : on le garde pour le
      // regrouper avec les suivants plutot que de lui donner une pleine largeur.
      if (seuls.length >= 2) {
        poser(seuls)
        seuls = []
      }
      poser(list.slice(i, i + run))
      i += run
    } else {
      seuls.push(list[i])
      i++
    }
  }
  poser(seuls)

  return rows
}

/** Nombre de visuels contenus dans les `n` premieres rangees. */
export const countIn = (rows: Row[], n: number) =>
  rows.slice(0, n).reduce((t, r) => t + r.items.length, 0)

/** Premieres rangees couvrant au moins `min` visuels, sans couper une rangee en deux. */
export function previewRows(rows: Row[], min: number): number {
  let total = 0
  for (let n = 0; n < rows.length; n++) {
    total += rows[n].items.length
    if (total >= min) return n + 1
  }
  return rows.length
}
