/**
 * Tri et filtres de l'index des projets — partagés entre la grille (`/projets`)
 * et la fiche (`/projet/...`).
 *
 * Ils vivent dans l'URL, et les cartes de la grille emportent ce bout d'URL
 * avec elles : la fiche sait donc dans quelle liste on l'a ouverte, et ses
 * flèches ← → suivent l'ordre qu'on avait sous les yeux plutôt que l'ordre brut
 * de l'index. Passer par l'URL plutôt que par un état en mémoire garde la
 * chose vraie après un rechargement, un partage de lien ou un retour arrière.
 */

import type { Project, VaultData } from './vault'

/**
 * Ordres de tri proposés. La clé vit dans l'URL (`?tri=`) comme les filtres,
 * `az` étant l'implicite — c'est déjà l'ordre dans lequel l'indexeur écrit les
 * projets, donc l'absence de paramètre n'a rien à réordonner.
 *
 * Les tris par date et par volume départagent les ex æquo par titre, sinon deux
 * projets de même fraîcheur s'échangeraient de place d'un rendu à l'autre.
 */
export const TRIS = {
  az: { label: 'A → Z', cmp: (a: Project, b: Project) => a.title.localeCompare(b.title, 'fr') },
  za: { label: 'Z → A', cmp: (a: Project, b: Project) => b.title.localeCompare(a.title, 'fr') },
  recent: {
    label: 'récent',
    cmp: (a: Project, b: Project) => b.mtime - a.mtime || a.title.localeCompare(b.title, 'fr'),
  },
  ancien: {
    label: 'ancien',
    cmp: (a: Project, b: Project) => a.mtime - b.mtime || a.title.localeCompare(b.title, 'fr'),
  },
  medias: {
    label: 'médias',
    cmp: (a: Project, b: Project) => b.count - a.count || a.title.localeCompare(b.title, 'fr'),
  },
} as const

export type Tri = keyof typeof TRIS

export const TRI_DEFAUT: Tri = 'az'

export interface Filtres {
  discipline: string
  tags: Set<string>
  tri: Tri
}

/** Les filtres portés par l'URL. Une valeur inconnue retombe sur l'implicite plutôt que de casser la page. */
export function lireFiltres(params: URLSearchParams): Filtres {
  const tri = params.get('tri') ?? ''
  return {
    discipline: params.get('discipline') ?? '',
    tags: new Set((params.get('tags') ?? '').split(',').filter(Boolean)),
    tri: tri in TRIS ? (tri as Tri) : TRI_DEFAUT,
  }
}

/** L'écriture inverse : ce qui vaut l'implicite ne s'écrit pas dans l'URL. */
export function ecrireFiltres(f: Filtres): URLSearchParams {
  const p = new URLSearchParams()
  if (f.discipline) p.set('discipline', f.discipline)
  if (f.tags.size) p.set('tags', [...f.tags].join(','))
  if (f.tri !== TRI_DEFAUT) p.set('tri', f.tri)
  return p
}

/** Projets d'une discipline — base du comptage des tags, avant le filtre par tag. */
export const parDiscipline = (data: VaultData, discipline: string) =>
  discipline ? data.projects.filter((p) => p.discipline === discipline) : data.projects

/**
 * La liste telle qu'elle s'affiche : discipline, puis tags (un projet doit
 * porter TOUS les tags cochés — on affine, on n'élargit pas), puis tri.
 * `sort` travaille sur une copie : `data.projects` est partagé avec le reste
 * du site.
 */
export function listeProjets(data: VaultData, f: Filtres): Project[] {
  const base = parDiscipline(data, f.discipline)
  const retenus = f.tags.size ? base.filter((p) => [...f.tags].every((t) => p.tags.includes(t))) : base
  return [...retenus].sort(TRIS[f.tri].cmp)
}
