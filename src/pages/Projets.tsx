import { Link, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { indexById, projectUrl, type Project, type VaultData } from '../lib/vault'

/**
 * Index unique des projets — les inspirations rangées par discipline et les
 * univers de référence sont la même chose (un dossier, une fiche, des médias
 * par aspect), donc une seule page les liste.
 *
 * Les filtres vivent dans l'URL : un état de tri se partage et le bouton retour
 * du navigateur le défait, plutôt que de disparaître au changement de page.
 */
export function Projets({ data }: { data: VaultData }) {
  const idx = indexById(data)
  const [params, setParams] = useSearchParams()

  const discipline = params.get('discipline') ?? ''
  const activeTags = useMemo(() => new Set((params.get('tags') ?? '').split(',').filter(Boolean)), [params])

  /** Disciplines qui ont au moins un projet, dans l'ordre du plus fourni. */
  const disciplines = useMemo(
    () =>
      data.disciplines
        .filter((d) => d.projectCount > 0)
        .map((d) => ({ ...d, projects: data.projects.filter((p) => p.discipline === d.name) }))
        .sort((a, b) => b.projectCount - a.projectCount),
    [data]
  )

  /** Projets restants après le filtre discipline — base du comptage des tags. */
  const byDiscipline = useMemo(
    () => (discipline ? data.projects.filter((p) => p.discipline === discipline) : data.projects),
    [data.projects, discipline]
  )

  /**
   * Les tags proposés sont ceux réellement portés par les projets visibles, et
   * seulement ceux qui trient quelque chose : un tag présent sur TOUS les
   * projets (`#inspiration`, `#ui`…) est du bruit, cliquer dessus ne retire
   * rien. On le masque tant qu'il ne discrimine pas.
   */
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of byDiscipline) for (const t of new Set(p.tags)) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()]
      .map(([name, n]) => ({ name, n }))
      .filter((t) => t.n < byDiscipline.length || activeTags.has(t.name))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'fr'))
  }, [byDiscipline, activeTags])

  /** Un projet doit porter TOUS les tags cochés — on affine, on n'élargit pas. */
  const shown = useMemo(
    () => (activeTags.size ? byDiscipline.filter((p) => [...activeTags].every((t) => p.tags.includes(t))) : byDiscipline),
    [byDiscipline, activeTags]
  )

  const setFilter = (next: { discipline?: string; tags?: Set<string> }) => {
    const p = new URLSearchParams()
    const d = next.discipline ?? discipline
    const t = next.tags ?? activeTags
    if (d) p.set('discipline', d)
    if (t.size) p.set('tags', [...t].join(','))
    setParams(p, { replace: true })
  }

  const toggleTag = (name: string) => {
    const next = new Set(activeTags)
    next.has(name) ? next.delete(name) : next.add(name)
    setFilter({ tags: next })
  }

  const filtered = Boolean(discipline) || activeTags.size > 0
  const emptyDisciplines = data.disciplines.filter((d) => d.projectCount === 0 && d.mediaCount === 0)

  return (
    <>
      <PageHead
        eyebrow="Projets"
        title="Tout ce qui est rangé"
        desc="Les inspirations et les univers de référence, dans un seul index. Chaque projet est un dossier du vault : une fiche, des médias en pleine qualité rangés par aspect. Trier par discipline ou par tag."
        right={
          <div className="text-right">
            <div className="display-md tabular-nums">{shown.length}</div>
            <div className="caption uppercase text-subtle mt-2">
              {shown.length > 1 ? 'projets' : 'projet'}
              {filtered && ` sur ${data.projects.length}`}
            </div>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {/* ------------------------------------------------ filtres */}
        <div className="mb-12 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="caption uppercase text-subtle w-24 shrink-0">Discipline</span>
            <FilterButton active={!discipline} onClick={() => setFilter({ discipline: '' })}>
              tout <Count n={data.projects.length} />
            </FilterButton>
            {disciplines.map((d) => (
              <FilterButton
                key={d.name}
                active={discipline === d.name}
                onClick={() => setFilter({ discipline: discipline === d.name ? '' : d.name })}
              >
                {d.label} <Count n={d.projectCount} />
              </FilterButton>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="caption uppercase text-subtle w-24 shrink-0">Tags</span>
              {tags.map((t) => (
                <FilterButton key={t.name} active={activeTags.has(t.name)} onClick={() => toggleTag(t.name)}>
                  #{t.name} <Count n={t.n} />
                </FilterButton>
              ))}
            </div>
          )}

          {filtered && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="caption uppercase text-subtle w-24 shrink-0" />
              <button
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className="label rounded-full px-4 py-2 text-subtle hover:text-foreground transition-colors"
              >
                tout effacer ✕
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------ projets */}
        {shown.length === 0 ? (
          <Empty
            title="Aucun projet avec ces filtres"
            hint="Retire un tag ou repasse sur « tout » — les tags se cumulent, un projet doit tous les porter."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
            {shown.map((p) => (
              <ProjectCard key={p.id} p={p} cover={p.cover ? idx.media.get(p.cover) ?? null : null} />
            ))}
          </div>
        )}

        {/* ------------------------------------------------ disciplines vides */}
        {emptyDisciplines.length > 0 && !filtered && (
          <section className="mt-24">
            <div className="flex items-baseline justify-between gap-4 mb-6 pb-4 border-b border-border">
              <h2 className="display-md text-subtle">Disciplines en attente</h2>
              <span className="caption text-subtle shrink-0">{emptyDisciplines.length} vides</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {emptyDisciplines.map((d) => (
                <div
                  key={d.name}
                  className="rounded-full border border-dashed border-border px-6 py-3"
                  title={d.path}
                >
                  <span className="label text-subtle">{d.label}</span>
                </div>
              ))}
            </div>
            <p className="caption text-subtle/70 mt-5 max-w-xl leading-relaxed">
              Ces dossiers existent dans le vault mais n'ont encore aucun projet. Lance <span className="mono">/inspi</span>{' '}
              ou <span className="mono">/univers</span> pour les remplir — la galerie suit au prochain{' '}
              <span className="mono">npm run index</span>.
            </p>
          </section>
        )}
      </div>
    </>
  )
}

/** Vignette d'un projet : visuel, titre, discipline, et ses tags en petit. */
function ProjectCard({ p, cover }: { p: Project; cover: { url: string; kind: string } | null }) {
  return (
    <Link to={projectUrl(p)} className="group block">
      <div className="aspect-[4/3] rounded-2xl bg-surface overflow-hidden flex items-center justify-center p-8 sm:p-10">
        {cover && cover.kind === 'image' ? (
          <img
            src={cover.url}
            alt={p.title}
            loading="lazy"
            className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <span className="caption text-subtle">aucun visuel</span>
        )}
      </div>

      <div className="mt-5 px-2 flex items-baseline gap-3">
        <h2 className="display-md group-hover:text-brand transition-colors">{p.title}</h2>
        <span className="caption text-subtle tabular-nums ml-auto shrink-0">{p.count}</span>
      </div>

      <div className="mt-2 px-2 flex items-baseline gap-x-3 min-w-0">
        <span className="caption uppercase text-subtle shrink-0">{p.disciplineLabel}</span>
        {p.categorie && <span className="caption text-subtle/60 shrink-0">{p.categorie}</span>}
        {p.annee && <span className="caption text-subtle/60 mono truncate">{p.annee}</span>}
      </div>

      {p.topTags.length > 0 && (
        <div className="mt-3 px-2 flex flex-wrap gap-1.5">
          {p.topTags.map((t) => (
            <span
              key={t}
              className="caption rounded-full bg-surface px-2.5 py-1 text-subtle/80 group-hover:bg-surface-strong transition-colors"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`label rounded-full px-4 py-2 border transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'border-border text-subtle hover:text-foreground hover:border-brand/40'
      }`}
    >
      {children}
    </button>
  )
}

const Count = ({ n }: { n: number }) => <span className="tabular-nums opacity-50">{n}</span>
