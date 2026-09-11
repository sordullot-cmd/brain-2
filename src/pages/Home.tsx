import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import {
  coursSections,
  coursUrl,
  fiche,
  fmtBytes,
  fmtDate,
  indexById,
  projectUrl,
  type Note,
  type VaultData,
} from '../lib/vault'
import { ProjectCover } from '../components/ProjectCover'

export function Home({ data }: { data: VaultData }) {
  const idx = indexById(data)

  /**
   * L'accueil montre ce qui vient d'arriver dans le vault, pas l'index complet :
   * les trois projets touchés le plus récemment. L'index, lui, reste alphabétique.
   */
  const recents = useMemo(
    () => [...data.projects].sort((a, b) => b.mtime - a.mtime).slice(0, 3),
    [data.projects]
  )

  /**
   * Même principe pour les cours, mais seulement du vrai cours : les fiches
   * d'UE et les chapitres du dossier d'éco gestion. Le plan, les pages de
   * méthode, les exercices et les notes d'amphi encore brutes restent sur
   * /cours — ici on ne veut que ce qui se révise.
   */
  const cours = useMemo(() => {
    const { fiches, chapitres } = coursSections(data)
    return [...fiches, ...chapitres].sort((a, b) => b.mtime - a.mtime)
  }, [data])
  const coursRecents = useMemo(() => cours.slice(0, 3), [cours])

  const stats = [
    { n: data.stats.notesTotal, l: 'notes' },
    { n: data.stats.media, l: 'médias' },
    { n: data.stats.projects, l: 'projets' },
    { n: data.stats.tags, l: 'tags' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-16 sm:pt-24 pb-16">
        <div className="caption uppercase text-subtle mb-6">Second cerveau · {data.vaultName}</div>
        <h1 className="display-xl max-w-5xl">
          Tout ce que j'ai gardé,
          <br />
          <span className="text-subtle">à portée d'œil.</span>
        </h1>
        <p className="mt-8 text-[16px] leading-relaxed text-muted max-w-xl text-pretty">
          Les projets — inspirations et univers de référence — et les notes du vault, parcourus visuellement
          plutôt que dossier par dossier.
        </p>

        <div className="mt-12 flex flex-wrap gap-x-14 gap-y-6">
          {stats.map((s) => (
            <div key={s.l}>
              <div className="display-md tabular-nums">{s.n}</div>
              <div className="caption uppercase text-subtle mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Projets en vedette */}
      {data.projects.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-20">
          <SectionTitle title="Projets récents" to="/projets" count={data.projects.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
            {recents.map((u) => {
              const cover = u.cover ? idx.media.get(u.cover) : null
              return (
                <Link key={u.id} to={projectUrl(u)} className="group block">
                  <ProjectCover p={u} cover={cover ?? null} />

                  <div className="mt-5 px-2 flex items-baseline gap-3">
                    <h3 className="display-md group-hover:text-brand transition-colors">{u.title}</h3>
                    <span className="caption text-subtle tabular-nums ml-auto shrink-0">
                      {u.count} · {fmtBytes(u.bytes)}
                    </span>
                  </div>

                  <div className="mt-2 px-2 caption uppercase text-subtle truncate">{u.disciplineLabel}</div>

                  {u.topTags.length > 0 && (
                    <div className="mt-3 px-2 flex flex-wrap gap-1.5">
                      {u.topTags.map((t) => (
                        <span key={t} className="caption rounded-full bg-surface px-2.5 py-1 text-subtle/80">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Cours récents */}
      {coursRecents.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-20">
          <SectionTitle title="Cours récents" to="/cours" count={cours.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {coursRecents.map((n) => (
              <CarteCours key={n.id} note={n} />
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <p className="caption text-subtle mono">
          Source : {data.vaultPath} · {fmtBytes(data.stats.bytes)} de médias
        </p>
      </section>
    </>
  )
}

function SectionTitle({ title, to, count }: { title: string; to: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-6 pb-4 border-b border-border">
      <h2 className="display-md">{title}</h2>
      <Link to={to} className="label text-subtle hover:text-foreground transition-colors shrink-0">
        voir les {count} →
      </Link>
    </div>
  )
}

/**
 * Une note de cours vue depuis l'accueil : son UE quand elle en a une, sa
 * notion, et la date de sa dernière retouche — c'est ce qui la fait remonter ici.
 */
function CarteCours({ note }: { note: Note }) {
  const f = fiche(note)
  return (
    <Link
      to={coursUrl(note)}
      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors flex flex-col"
    >
      <div className="flex items-center gap-3 mb-3.5">
        <span className="caption uppercase text-subtle">{f.ue ? `UE ${f.ue}` : 'Cours'}</span>
        {f.coef !== null && <span className="caption text-subtle tabular-nums">coef {f.coef}</span>}
        <span className="caption text-subtle/60 mono ml-auto shrink-0">{fmtDate(note.mtime)}</span>
      </div>

      <div className="label mb-2.5">{note.title}</div>
      <p className="caption text-subtle line-clamp-2 leading-[1.6]">{f.notion ?? note.excerpt ?? '—'}</p>
    </Link>
  )
}
