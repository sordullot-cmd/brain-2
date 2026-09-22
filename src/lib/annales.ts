/**
 * Les annales — sujets d'examen des années précédentes.
 *
 * Produites par `python3 scripts/annales.py` depuis `~/Documents/L1`, hors du
 * vault : ce sont des documents de la fac, pas des notes. Deux fichiers, pour
 * la même raison que les notes (voir vault.ts) : `annales.json` porte ce qu'une
 * liste affiche, `annales-qcm.json` les 700 questions, qui ne servent qu'à la
 * page qui les joue.
 */

import { useEffect, useState } from 'react'

export interface Page {
  url: string
  mini: string
  nom: string
  w: number
  h: number
}

export interface Question {
  /** Rang dans l'épreuve entière. */
  n: number
  /** Numéro tel que le sujet l'écrit — il repart à 1 à chaque thème. */
  numero: number
  theme: string | null
  enonce: string
  options: { lettre: string; texte: string; correcte: boolean }[]
  multiple: boolean
  /**
   * D'où sort la bonne réponse quand le fichier d'annale ne la donnait pas :
   * le cours du prof, un corrigé d'une autre année, une source publique. Absent
   * = la réponse vient du corrigé de l'épreuve elle-même.
   */
  source?: string
}

export interface Tableau {
  colonnes: string[]
  lignes: string[][]
}

export interface PartieSujet {
  titre: string
  points: number | null
  enonce: string[]
  /** Les tableaux de l'énoncé (contingence, barème…), rendus comme tableaux. */
  tableaux?: Tableau[]
  questions: { ref: string; texte: string; points: number | null }[]
}

export interface Sujet {
  entete: {
    duree: string | null
    documents: string | null
    enseignant: string | null
    consignes: string[]
  }
  parties: PartieSujet[]
}

export interface Epreuve {
  id: string
  slug: string
  matiere: string
  matiereSlug: string
  titre: string
  type: string | null
  annee: string | null
  session: number | null
  numero: number | null
  corrige: boolean
  format: 'pdf' | 'image' | 'photos'
  pages: Page[]
  nbPages: number
  /** Le sujet reconstruit : exercices, questions, barème. `null` si rien n'a pu l'être. */
  epreuve: Sujet | null
  /** Le PDF portait du texte sélectionnable (sinon c'est un scan transcrit à la main). */
  aDuTexte: boolean
  /** Présent quand l'épreuve est un QCM : le décompte, les questions sont à part. */
  qcm: {
    nbQuestions: number
    themes: string[]
    multiples: number
    sansReponse: number[]
    /** Questions dont la réponse a été retrouvée ailleurs que dans le fichier. */
    retrouvees: number
  } | null
  /** L'autre fichier de la paire sujet / corrigé. */
  corrigePar?: string
  corrigeDe?: string
  original: { url: string; nom: string; octets: number; ext: string } | null
  octets: number
  mtime: number
  /** Ce que la transcription signale : ce qui reste illisible sur le scan. */
  note?: string
}

export interface Matiere {
  slug: string
  nom: string
  count: number
  annees: string[]
}

export interface AnnalesData {
  generatedAt: string
  source: string
  matieres: Matiere[]
  epreuves: Epreuve[]
  stats: {
    matieres: number
    epreuves: number
    pages: number
    reconstruites: number
    qcm: number
    questions: number
    octets: number
  }
}

export interface QcmData {
  id: string
  titre: string
  matiere: string
  matiereSlug: string
  annee: string | null
  questions: Question[]
}

let cache: AnnalesData | null = null
let promesse: Promise<AnnalesData> | null = null

export function loadAnnales(): Promise<AnnalesData> {
  promesse ??= fetch('/annales.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: AnnalesData) => (cache = j))
    .catch(() => {
      promesse = null
      return vide
    })
  return promesse
}

const vide: AnnalesData = {
  generatedAt: '',
  source: '',
  matieres: [],
  epreuves: [],
  stats: { matieres: 0, epreuves: 0, pages: 0, reconstruites: 0, qcm: 0, questions: 0, octets: 0 },
}

/** Les annales dans un composant, chargées au besoin. `null` = pas encore là. */
export function useAnnales(): AnnalesData | null {
  const [data, setData] = useState<AnnalesData | null>(cache)
  useEffect(() => {
    if (cache) return setData(cache)
    let vivant = true
    loadAnnales().then((d) => vivant && setData(d))
    return () => {
      vivant = false
    }
  }, [])
  return data
}

let qcmCache: Map<string, QcmData> | null = null
let qcmPromesse: Promise<Map<string, QcmData>> | null = null

export function loadQcm(): Promise<Map<string, QcmData>> {
  qcmPromesse ??= fetch('/annales-qcm.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { qcm: QcmData[] }) => (qcmCache = new Map(j.qcm.map((q) => [q.id, q]))))
    .catch(() => {
      qcmPromesse = null
      return new Map<string, QcmData>()
    })
  return qcmPromesse
}

export function useQcm(id: string | null): QcmData | null | undefined {
  const [q, setQ] = useState<QcmData | null | undefined>(
    id && qcmCache ? (qcmCache.get(id) ?? null) : undefined
  )
  useEffect(() => {
    if (!id) return setQ(null)
    let vivant = true
    loadQcm().then((m) => vivant && setQ(m.get(id) ?? null))
    return () => {
      vivant = false
    }
  }, [id])
  return q
}

/* ------------------------------------------------------------------ lecture */

/** L'intitulé court d'une épreuve : « Examen 2021-2022 · session 2 ». */
export function intitule(e: Epreuve): string {
  return [e.type ?? 'Épreuve', e.annee, e.session ? `session ${e.session}` : null]
    .filter(Boolean)
    .join(' · ')
}

export const epreuveUrl = (e: Epreuve) => `/annales/${e.id}`

/** Ce que l'épreuve offre à faire, dans l'ordre où ça vaut le coup. */
export function forme(e: Epreuve): 'qcm' | 'sujet' | 'pages' {
  if (e.qcm) return 'qcm'
  if (e.epreuve?.parties.length) return 'sujet'
  return 'pages'
}

export const nbQuestions = (e: Epreuve) =>
  e.qcm?.nbQuestions ?? (e.epreuve?.parties.reduce((s, p) => s + p.questions.length, 0) ?? 0)

/** Les épreuves d'une matière, les plus récentes d'abord. */
export function parMatiere(data: AnnalesData, slug: string): Epreuve[] {
  return data.epreuves.filter((e) => e.matiereSlug === slug)
}

export const fmtOctets = (b: number) =>
  b < 1024 * 1024 ? `${Math.round(b / 1024)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`
