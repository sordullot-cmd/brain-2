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

import type { Facette, Project, VaultData } from './vault'

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

/**
 * Les tags proposés en filtre, une liste par facette.
 *
 * Le décompte est refait sur les projets visibles plutôt que repris de
 * `data.facettesProjets` : choisir une discipline change ce que chaque tag
 * ramène, et un bouton qui annonce 12 pour n'en ouvrir que 3 ment.
 *
 * Deux tags sont écartés : ceux que PERSONNE ne porte dans la vue courante, et
 * ceux que TOUT LE MONDE y porte — cliquer sur `#finance` dans la discipline
 * qui n'a que de la finance ne retire rien. Un tag déjà coché reste affiché
 * quoi qu'il arrive, sinon on ne pourrait plus le décocher.
 */
export function facettesVisibles(
  data: VaultData,
  visibles: Project[],
  actifs: Set<string>
): { cle: Facette; label: string; tags: { name: string; n: number }[] }[] {
  const compte = new Map<string, number>()
  for (const p of visibles) for (const t of new Set(p.tags)) compte.set(t, (compte.get(t) ?? 0) + 1)

  return data.facettesProjets
    .map(({ cle, label, tags }) => ({
      cle,
      label,
      tags: tags
        .map(({ name }) => ({ name, n: compte.get(name) ?? 0 }))
        .filter((t) => (t.n > 0 && t.n < visibles.length) || actifs.has(t.name))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'fr')),
    }))
    .filter((f) => f.tags.length)
}
