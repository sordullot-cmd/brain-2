/**
 * Composition des visuels d'un aspect.
 *
 * Plutot que d'aligner tout le monde dans la meme grille carree, on lit le
 * format reel de chaque image et on en deduit une mise en page :
 *
 *   - un visuel de signature (le logo, une image panoramique) prend toute la
 *     largeur ;
 *   - une serie de visuels de meme format (des iterations de logo, des ecrans
 *     d'app) devient un quadrillage regulier ;
 *   - le reste est justifie par rangees, largeurs proportionnelles au format,
 *     hauteurs egalisees — comme une planche contact.
 *
 * Le resultat est deterministe : meme dossier, meme mise en page.
 */
import type { Media } from './vault'

export type Row =
  | { kind: 'feature'; items: Media[] }
  /** Rangee justifiee : `sum` est la somme des formats, donc le format de la rangee. */
  | { kind: 'justified'; items: Media[]; sum: number }
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

/** Classe de format, pour regrouper les visuels de meme allure. */
const bucket = (r: number) => (r > 2.2 ? 0 : r > 1.3 ? 1 : r > 0.95 ? 2 : r > 0.7 ? 3 : 4)

/** Colonnes d'un quadrillage, selon le format des visuels qui le composent. */
const gridCols = (r: number) => (r > 2.2 ? 2 : r > 1.3 ? 3 : 4)

/** Deux visuels sont « de la meme serie » si leur format est quasiment identique. */
const sameShape = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.06

/** Longueur de la serie de meme format qui commence a `i`. */
function runLength(list: Media[], i: number): number {
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
function arrange(items: Media[]): Media[] {
  const list = items.map((m, i) => ({ m, i }))

  const weight = new Map<number, number>()
  for (const { m } of list) {
    const b = bucket(mediaRatio(m))
    weight.set(b, (weight.get(b) ?? 0) + 1)
  }

  list.sort((a, b) => {
    const ba = bucket(mediaRatio(a.m))
    const bb = bucket(mediaRatio(b.m))
    if (ba !== bb) {
      // Le plus represente passe devant ; a egalite, du plus large au plus haut.
      const d = (weight.get(bb) ?? 0) - (weight.get(ba) ?? 0)
      if (d !== 0) return d
      return ba - bb
    }
    return a.i - b.i
  })

  const sorted = list.map((x) => x.m)

  // Le visuel de signature passe devant, s'il y en a un et qu'il n'y est pas deja.
  const hero = sorted.findIndex((m) => SIGNATURE.test(m.stem) && mediaRatio(m) >= 0.95)
  if (hero > 0) {
    const [m] = sorted.splice(hero, 1)
    sorted.unshift(m)
  }

  return sorted
}

/** Somme de formats visee par une rangee justifiee : ~3 paysages, ~4 portraits. */
const TARGET = 3.2
const MAX_PER_ROW = 4
/** Au-dela, une image seule en pleine largeur devient ecrasante. */
const MAX_FEATURES = 2

export function layoutMedia(items: Media[]): Row[] {
  if (!items.length) return []

  const list = arrange(items)
  const rows: Row[] = []
  let features = 0
  let i = 0

  /**
   * On n'ouvre en pleine largeur que si le premier visuel le merite vraiment :
   * un logo identifie par son nom, ou un petit lot ou chaque piece compte.
   * Sinon on attaque directement par le quadrillage — mieux vaut pas de vedette
   * qu'une vedette arbitraire.
   */
  const opener = SIGNATURE.test(list[0].stem) || items.length <= 6

  while (i < list.length) {
    const m = list[i]
    const r = mediaRatio(m)

    // 1. Signature d'ouverture, ou image panoramique : pleine largeur.
    const opens = i === 0 && opener && r >= 0.95 && list.length >= 3
    if (features < MAX_FEATURES && (opens || r >= 3)) {
      rows.push({ kind: 'feature', items: [m] })
      features++
      i++
      continue
    }

    // 2. Serie de meme format : quadrillage regulier.
    const run = runLength(list, i)
    if (run >= 4) {
      const cols = gridCols(r)
      // Une rangee par ligne du quadrillage : l'ecart entre rangees est le meme
      // que l'ecart entre colonnes, donc ca reste un quadrillage continu — mais
      // l'apercu peut couper proprement entre deux lignes.
      for (let k = 0; k < run; k += cols) {
        rows.push({ kind: 'grid', items: list.slice(i + k, i + Math.min(k + cols, run)), cols, ratio: r })
      }
      i += run
      continue
    }

    // 3. Sinon, on remplit une rangee justifiee.
    const row: Media[] = []
    let sum = 0
    while (i < list.length && row.length < MAX_PER_ROW) {
      // Ne pas amputer la serie suivante : elle a droit a son propre quadrillage.
      if (row.length && runLength(list, i) >= 4) break
      const rr = mediaRatio(list[i])
      if (row.length && sum + rr > TARGET * 1.35) break
      row.push(list[i])
      sum += rr
      i++
      if (sum >= TARGET) break
    }
    rows.push({ kind: 'justified', items: row, sum })
  }

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
