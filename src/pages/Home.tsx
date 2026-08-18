import { Link } from 'react-router-dom'
import { fmtBytes, indexById, projectUrl, type VaultData } from '../lib/vault'

export function Home({ data }: { data: VaultData }) {
  const idx = indexById(data)

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
          <SectionTitle title="Projets" to="/projets" count={data.projects.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
            {data.projects.slice(0, 6).map((u) => {
              const cover = u.cover ? idx.media.get(u.cover) : null
              return (
                <Link key={u.id} to={projectUrl(u)} className="group block">
                  <div className="aspect-[4/3] rounded-2xl bg-surface overflow-hidden flex items-center justify-center p-8 sm:p-10">
                    {cover ? (
                      <img
                        src={cover.url}
                        alt={u.title}
                        loading="lazy"
                        className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-[1.05]"
                      />
                    ) : (
                      <span className="caption text-subtle">aucun visuel</span>
                    )}
                  </div>

                  <div className="mt-5 px-2 flex items-baseline gap-3">
                    <h3 className="display-md group-hover:text-brand transition-colors">{u.title}</h3>
                    <span className="caption text-subtle tabular-nums ml-auto shrink-0">{u.count}</span>
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
