/**
 * Les livres ajoutés depuis le site vivent dans la table Supabase `livres`
 * (schéma : `supabase/livres.sql`), lue et écrite directement par le
 * navigateur via l'API REST. Pas de compte : tout le monde peut ajouter,
 * modifier, supprimer — c'est le choix fait pour cette page.
 *
 * L'adresse et la clé publique viennent de l'environnement de build
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`), à poser dans `.env.local` et
 * dans les réglages Vercel. La clé publique est faite pour être vue : c'est
 * la sécurité de la table (RLS) qui décide de ce qu'elle permet.
 */

import type { Livre } from './vault'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const baseConfiguree = Boolean(URL_ && KEY)

export type Statut = Livre['statut']
export const STATUTS: Statut[] = ['à lire', 'en cours', 'lu']

/** Une ligne de la table, telle que Supabase la renvoie. */
export interface LivreDb {
  id: string
  titre: string
  auteur: string | null
  statut: Statut
  genre: string | null
  note: number | null
  debut: string | null
  fin: string | null
  recommande_par: string | null
  couverture: string | null
  phrase: string | null
  appris: string[]
  appliquer: { texte: string; fait: boolean }[]
  citations: string[]
  notes: string | null
  created_at: string
  updated_at: string
}

export type LivrePatch = Partial<Omit<LivreDb, 'id' | 'created_at' | 'updated_at'>>

async function req<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  if (!URL_ || !KEY) throw new Error('Base non configurée')
  const r = await fetch(`${URL_}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  if (!r.ok) {
    const corps = await r.json().catch(() => null)
    // PGRST205 : la table n'existe pas encore — le SQL n'a pas été lancé.
    if (corps?.code === 'PGRST205') throw new Error('La table « livres » n’existe pas encore dans Supabase.')
    throw new Error(corps?.message ?? `Erreur ${r.status}`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

export const listerLivres = () => req<LivreDb[]>('livres?select=*&order=updated_at.desc')

export const lireLivre = async (id: string) =>
  (await req<LivreDb[]>(`livres?select=*&id=eq.${encodeURIComponent(id)}`))[0] ?? null

export const creerLivre = async (l: LivrePatch & { titre: string }) =>
  (await req<LivreDb[]>('livres', { method: 'POST', body: JSON.stringify(l) }))[0]

export const modifierLivre = async (id: string, patch: LivrePatch) =>
  (await req<LivreDb[]>(`livres?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }))[0]

export const supprimerLivre = (id: string) =>
  req<void>(`livres?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

/** Une ligne de la base, au format commun que la page affiche. */
export const versLivre = (d: LivreDb): Livre => ({
  id: d.id,
  noteId: null,
  titre: d.titre,
  auteur: d.auteur,
  statut: d.statut,
  genre: d.genre,
  note: d.note,
  ajoute: d.created_at.slice(0, 10),
  debut: d.debut,
  fin: d.fin,
  recommandePar: d.recommande_par,
  couverture: d.couverture ? { url: d.couverture } : null,
  phrase: d.phrase,
  appris: d.appris ?? [],
  appliquer: d.appliquer ?? [],
  citations: d.citations ?? [],
  mtime: Date.parse(d.updated_at),
})

/**
 * Recherche sur Open Library, pour remplir titre, auteur et couverture d'un
 * coup au lieu de tout taper. Service ouvert, sans clé, CORS autorisé.
 */
export interface Suggestion {
  titre: string
  auteur: string | null
  annee: number | null
  couverture: string | null
}

export async function chercherOpenLibrary(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=title,author_name,cover_i,first_publish_year`
  const r = await fetch(url, { signal })
  if (!r.ok) return []
  const d = await r.json()
  return (d.docs ?? []).map((x: { title: string; author_name?: string[]; cover_i?: number; first_publish_year?: number }) => ({
    titre: x.title,
    auteur: x.author_name?.[0] ?? null,
    annee: x.first_publish_year ?? null,
    couverture: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg` : null,
  }))
}
