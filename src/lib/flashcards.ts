/**
 * Les cartes de révision : chargement des paquets extraits des fiches
 * (`public/vault-cartes.json`, produit par `scripts/flashcards.mjs`), cartes
 * écrites à la main, et le petit système de répétition espacée qui décide ce
 * qui repasse aujourd'hui.
 *
 * Deux choses vivent ici, et une seule est durable :
 *
 * - les CARTES DES FICHES viennent du vault, en lecture seule. Corriger une
 *   carte, c'est corriger sa fiche dans Obsidian puis relancer `npm run index` ;
 * - la PROGRESSION (et les cartes ajoutées depuis le site) vit dans le
 *   navigateur, en localStorage. C'est un cahier de révision, pas du contenu :
 *   il n'a rien à faire dans le vault, et le perdre ne perd aucun cours.
 */

import { useEffect, useState } from 'react'

export interface Carte {
  /** Stable tant que le recto ne change pas — la progression y est accrochée. */
  id: string
  recto: string
  verso: string
  tags: string[]
}

export interface Paquet {
  /** L'identifiant de la fiche d'où viennent les cartes, `null` pour les cartes maison. */
  noteId: string | null
  titre: string
  ue: string | null
  periode: number | null
  cartes: Carte[]
}

/** Le paquet qui ramasse les cartes écrites depuis le site. */
export const PAQUET_PERSO = 'perso'

/* ------------------------------------------------------- chargement du JSON */

interface CartesData {
  generatedAt: string
  paquets: Paquet[]
}

let cache: CartesData | null = null
let promesse: Promise<CartesData> | null = null

export function loadCartes(): Promise<CartesData> {
  promesse ??= fetch('/vault-cartes.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: CartesData) => (cache = j))
    .catch(() => {
      // Pas de fichier (index pas relancé) : la page le dit, elle ne casse pas.
      promesse = null
      return { generatedAt: '', paquets: [] }
    })
  return promesse
}

/** Les paquets des fiches, chargés au besoin. `null` tant qu'ils arrivent. */
export function usePaquets(): Paquet[] | null {
  const [paquets, setPaquets] = useState<Paquet[] | null>(cache?.paquets ?? null)
  useEffect(() => {
    if (cache) return setPaquets(cache.paquets)
    let vivant = true
    loadCartes().then((d) => vivant && setPaquets(d.paquets))
    return () => {
      vivant = false
    }
  }, [])
  return paquets
}

/* ------------------------------------------------------- répétition espacée

   Un SM-2, celui d'Anki dans sa forme utile : quatre réponses, un facteur de
   facilité propre à chaque carte, et deux phases.

   Pourquoi quatre et pas deux : « su / pas su » ne dit pas à quel prix on a
   répondu. Une définition sortie en hésitant et une définition sortie du tac au
   tac ne demandent pas le même délai, et c'est précisément ce délai qui fait
   tout le rendement de la répétition espacée. « Difficile » rapproche la carte
   et rend le rappel moins confortable la prochaine fois ; « Facile » l'éloigne
   et cesse d'y perdre du temps.

   Deux phases, comme Anki :

   - APPRENTISSAGE — la carte n'a pas encore d'intervalle en jours. Elle
     revient dans la minute, puis dans le quart d'heure, dans la session même,
     jusqu'à ce qu'elle « sorte » avec un premier intervalle d'un jour.
   - RÉVISION — la carte a un intervalle en jours, multiplié à chaque passage
     par sa facilité. Un échec la renvoie en réapprentissage et raccourcit
     l'intervalle sans le remettre à zéro : ce qui a été appris une fois se
     réapprend plus vite.
   -------------------------------------------------------------------------- */

const MINUTE = 60_000
const JOUR = 86_400_000

/** Les quatre réponses, dans l'ordre où elles s'affichent sous la carte. */
export type Reponse = 'revoir' | 'difficile' | 'correct' | 'facile'

export const REPONSES: { cle: Reponse; label: string; touche: string }[] = [
  { cle: 'revoir', label: 'À revoir', touche: '1' },
  { cle: 'difficile', label: 'Difficile', touche: '2' },
  { cle: 'correct', label: 'Correct', touche: '3' },
  { cle: 'facile', label: 'Je savais', touche: '4' },
]

/** Les rappels de la phase d'apprentissage, en minutes. */
const APPRENTISSAGE = [1, 15]

/** Le rappel unique après un échec sur une carte déjà apprise, en minutes. */
const REAPPRENTISSAGE = 20

/** Premier intervalle d'une carte sortie d'apprentissage, en jours. */
const DIPLOME = 1

/** Celui d'une carte sortie d'emblée par « Je savais » — inutile de la revoir demain. */
const DIPLOME_FACILE = 4

/**
 * La facilité : le multiplicateur d'intervalle d'une carte. 2,5 au départ (une
 * carte revient deux fois et demie plus tard à chaque passage réussi), jamais
 * en dessous de 1,3 — sous ce seuil une carte se répète sans jamais rentrer,
 * c'est qu'elle est mal écrite, pas mal sue.
 */
const FACILITE_DEPART = 2.5
const FACILITE_MIN = 1.3

/** Ce que chaque réponse fait à la facilité de la carte. */
const DELTA: Record<Reponse, number> = { revoir: -0.2, difficile: -0.15, correct: 0, facile: 0.15 }

/** Multiplicateurs d'intervalle : « difficile » avance à peine, « facile » prend une prime. */
const MULT_DIFFICILE = 1.2
const PRIME_FACILE = 1.3

/** Après un échec : ce qu'il reste de l'intervalle, et son plancher en jours. */
const APRES_ECHEC = 0.4
const ECHEC_MIN = 1

/** Un semestre se révise à l'année, pas au siècle. */
const INTERVALLE_MAX = 365

/** Au-delà de cet intervalle, la carte est dite acquise (le seuil « mature » d'Anki). */
export const INTERVALLE_ACQUIS = 21

export type Phase = 'apprentissage' | 'revision' | 'reapprentissage'

export interface EtatCarte {
  phase: Phase
  /** Où l'on en est dans les rappels d'apprentissage. */
  etape: number
  /** Intervalle courant en jours — 0 tant que la carte n'est pas sortie d'apprentissage. */
  intervalle: number
  facilite: number
  /** Date du prochain passage, en ms. */
  du: number
  vues: number
  ratees: number
  /** Dernier passage, en ms. */
  vue: number
  /** La dernière réponse donnée, pour pouvoir la relire. */
  derniere?: Reponse
}

export type Progression = Record<string, EtatCarte>

// v2 : le Leitner à six boîtes de la première version n'a pas d'équivalent en
// facilité, et une progression de quelques jours ne vaut pas une migration
// approximative — on repart d'une clé neuve.
const CLE_PROGRESSION = 'brain2.revision.v2'
const CLE_PERSO = 'brain2.cartes-perso.v1'

/** localStorage peut manquer (navigation privée) : jamais de page blanche pour ça. */
function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle)
    return brut ? (JSON.parse(brut) as T) : defaut
  } catch {
    return defaut
  }
}

function ecrire(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    /* quota plein ou stockage refusé : la session reste jouable, sans mémoire */
  }
}

export const chargerProgression = () => lire<Progression>(CLE_PROGRESSION, {})

export const enregistrerProgression = (p: Progression) => ecrire(CLE_PROGRESSION, p)

export const NEUVE: EtatCarte = {
  phase: 'apprentissage',
  etape: 0,
  intervalle: 0,
  facilite: FACILITE_DEPART,
  du: 0,
  vues: 0,
  ratees: 0,
  vue: 0,
}

const borner = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max)

/**
 * Le délai (en ms) que vaut chaque réponse, et l'état qui va avec.
 *
 * Séparé de l'enregistrement pour que les boutons puissent annoncer « 3 j » ou
 * « 12 j » avant qu'on clique : savoir ce qu'on engage fait partie du choix.
 */
export function planifier(etat: EtatCarte | undefined, r: Reponse, now = Date.now()): EtatCarte {
  const e = etat ?? NEUVE
  const facilite = borner(e.facilite + DELTA[r], FACILITE_MIN, 3.5)
  const suivant = (delai: number, reste: Partial<EtatCarte>): EtatCarte => ({
    ...e,
    ...reste,
    facilite,
    du: now + delai,
    vues: e.vues + 1,
    ratees: e.ratees + (r === 'revoir' ? 1 : 0),
    vue: now,
    derniere: r,
  })

  // --- en train de l'apprendre (ou de la réapprendre après un échec)
  if (e.phase !== 'revision') {
    const paliers = e.phase === 'reapprentissage' ? [REAPPRENTISSAGE] : APPRENTISSAGE

    if (r === 'revoir')
      return suivant(paliers[0] * MINUTE, { phase: e.phase, etape: 0 })

    if (r === 'facile')
      // On la connaît déjà : inutile de la faire tourner dans la session.
      return suivant(DIPLOME_FACILE * JOUR, {
        phase: 'revision',
        etape: 0,
        intervalle: DIPLOME_FACILE,
      })

    // « Difficile » ne fait pas avancer la carte : elle repasse entre le palier
    // courant et le suivant — plus tard qu'un échec, plus tôt qu'une réussite.
    if (r === 'difficile') {
      const ici = paliers[e.etape]
      const apres = paliers[e.etape + 1] ?? ici * 2
      return suivant(((ici + apres) / 2) * MINUTE, { etape: e.etape })
    }

    const etape = e.etape + 1
    if (etape < paliers.length) return suivant(paliers[etape] * MINUTE, { etape })

    // Dernier palier franchi : la carte sort avec son premier intervalle. Une
    // carte qui revient d'un échec reprend l'intervalle qu'on lui avait laissé.
    const intervalle = e.phase === 'reapprentissage' ? Math.max(e.intervalle, ECHEC_MIN) : DIPLOME
    return suivant(intervalle * JOUR, { phase: 'revision', etape: 0, intervalle })
  }

  // --- déjà apprise : c'est l'intervalle qui bouge
  if (r === 'revoir') {
    // Un oubli ne remet pas tout à zéro : ce qui a été su une fois revient vite.
    const intervalle = Math.max(ECHEC_MIN, Math.round(e.intervalle * APRES_ECHEC))
    return suivant(REAPPRENTISSAGE * MINUTE, { phase: 'reapprentissage', etape: 0, intervalle })
  }

  const mult = r === 'difficile' ? MULT_DIFFICILE : r === 'facile' ? facilite * PRIME_FACILE : facilite
  const intervalle = borner(Math.round(Math.max(e.intervalle, 1) * mult), e.intervalle + 1, INTERVALLE_MAX)
  return suivant(intervalle * JOUR, { phase: 'revision', etape: 0, intervalle })
}

/** Le délai qu'une réponse engage, en ms — ce que les boutons annoncent. */
export const delai = (etat: EtatCarte | undefined, r: Reponse, now = Date.now()) =>
  planifier(etat, r, now).du - now

/** « 15 min », « 3 j », « 2 mois » — arrondi au plus lisible. */
export function fmtDelai(ms: number): string {
  const min = ms / MINUTE
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  if (min < 60 * 20) return `${Math.round(min / 60)} h`
  const jours = ms / JOUR
  if (jours < 31) return `${Math.round(jours)} j`
  if (jours < 365) return `${Math.round(jours / 30)} mois`
  return `${(jours / 365).toFixed(1)} an`
}

/** Une carte est à revoir si elle n'a jamais été vue ou si son délai est écoulé. */
export const estDue = (etat: EtatCarte | undefined, now = Date.now()) => !etat || etat.du <= now

/**
 * Une carte qui doit repasser dans la session en cours plutôt qu'un autre jour :
 * tout ce qui est encore en (ré)apprentissage, donc à moins d'une heure.
 */
export const revientDansLaSession = (etat: EtatCarte) => etat.phase !== 'revision'

/** L'état d'une carte, en clair, pour le pied du lecteur. */
export function etiquette(etat: EtatCarte | undefined): string {
  if (!etat || etat.vues === 0) return 'nouvelle carte'
  if (etat.phase !== 'revision') return `en apprentissage · vue ${etat.vues} fois`
  return `intervalle ${fmtDelai(etat.intervalle * JOUR)} · facilité ${etat.facilite.toFixed(2)}`
}

/* --------------------------------------------------------- cartes écrites ici */

export interface CartePerso extends Carte {
  /** La fiche à laquelle la rattacher, ou `null` pour le paquet « Mes cartes ». */
  noteId: string | null
  cree: number
}

export const chargerPerso = () => lire<CartePerso[]>(CLE_PERSO, [])

export const enregistrerPerso = (cartes: CartePerso[]) => ecrire(CLE_PERSO, cartes)

/** Un identifiant qui ne peut pas entrer en collision avec celui d'une fiche. */
export const idPerso = () => `perso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/**
 * Les paquets du vault, augmentés des cartes maison : celles rattachées à une
 * fiche rejoignent la sienne, les autres forment le paquet « Mes cartes ».
 */
export function fusionner(paquets: Paquet[], perso: CartePerso[]): Paquet[] {
  if (perso.length === 0) return paquets

  const out = paquets.map((p) => ({ ...p, cartes: [...p.cartes] }))
  const parNote = new Map(out.map((p) => [p.noteId, p]))
  const libres: Carte[] = []

  for (const c of perso) {
    const carte: Carte = { id: c.id, recto: c.recto, verso: c.verso, tags: c.tags }
    const cible = c.noteId ? parNote.get(c.noteId) : null
    if (cible) cible.cartes.push(carte)
    else libres.push(carte)
  }

  if (libres.length > 0)
    out.push({ noteId: null, titre: 'Mes cartes', ue: null, periode: null, cartes: libres })

  return out
}

/** La clé qui identifie un paquet dans la sélection et dans les URL. */
export const clePaquet = (p: Paquet) => p.noteId ?? PAQUET_PERSO

/* ------------------------------------------------------------------ compter */

export interface Compte {
  total: number
  neuves: number
  dues: number
  acquises: number
}

export function compter(cartes: Carte[], prog: Progression, now = Date.now()): Compte {
  let neuves = 0
  let dues = 0
  let acquises = 0
  for (const c of cartes) {
    const e = prog[c.id]
    if (!e || e.vues === 0) neuves++
    if (estDue(e, now)) dues++
    if (e && e.phase === 'revision' && e.intervalle >= INTERVALLE_ACQUIS) acquises++
  }
  return { total: cartes.length, neuves, dues, acquises }
}

/** Mélange (Fisher-Yates) — l'ordre du fichier n'est pas un ordre de révision. */
export function melanger<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Le format d'import d'Anki, tel que les fiches l'écrivent déjà. */
export const versAnki = (cartes: Carte[]) =>
  cartes.map((c) => [c.recto, c.verso, c.tags.join(' ')].filter(Boolean).join(' ; ')).join('\n')
