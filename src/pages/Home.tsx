import { Link } from 'react-router-dom'
import { contentNotes, fmtBytes, fmtDate, indexById, type VaultData } from '../lib/vault'

export function Home({ data }: { data: VaultData }) {
  const idx = indexById(data)
  const recent = [...contentNotes(data)]
    .filter((n) => !n.isIndex)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 6)
  const topTags = data.tags.slice(0, 14)

  const stats = [
    { n: data.stats.notesTotal, l: 'notes' },
    { n: data.stats.media, l: 'médias' },
    { n: data.stats.universes, l: 'univers' },
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
          Les inspirations, les univers de référence et les notes du vault, parcourus visuellement plutôt que
          dossier par dossier.
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

      {/* Univers en vedette */}
      {data.universes.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-20">
          <SectionTitle title="Univers" to="/univers" count={data.universes.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
            {data.universes.map((u) => {
              const cover = u.cover ? idx.media.get(u.cover) : null
              return (
                <Link key={u.slug} to={`/univers/${u.slug}`} className="group block">
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

                  <div className="mt-5 flex items-baseline gap-3">
                    <h3 className="display-md group-hover:text-brand transition-colors">{u.title}</h3>
                    <span className="caption text-subtle tabular-nums ml-auto shrink-0">{u.count}</span>
                  </div>

                  {u.couleurs.length > 0 && (
                    <div className="mt-3.5 flex gap-1">
                      {u.couleurs.slice(0, 10).map((c, i) => (
                        <span key={i} className="h-4 flex-1 rounded-[2px]" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Notes récentes */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-20">
        <SectionTitle title="Notes récentes" to="/notes" count={data.stats.notesTotal} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recent.map((n) => (
            <Link
              key={n.id}
              to={`/note/${n.id.split('/').map(encodeURIComponent).join('/')}`}
              className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
            >
              <div className="caption uppercase text-subtle mb-3 truncate">{n.folder || 'racine'}</div>
              <div className="label mb-2.5">{n.title}</div>
              <p className="caption text-subtle leading-[1.6] line-clamp-3">{n.excerpt || '—'}</p>
              <div className="caption text-subtle/60 mt-4 mono">{fmtDate(n.mtime)}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tags */}
      <section className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <SectionTitle title="Tags" to="/tags" count={data.stats.tags} />
        <div className="flex flex-wrap gap-2">
          {topTags.map((t) => (
            <Link
              key={t.name}
              to={`/tags/${encodeURIComponent(t.name)}`}
              className="label px-3.5 py-2 rounded-lg bg-surface text-subtle hover:bg-surface-strong hover:text-foreground transition-colors"
            >
              #{t.name} <span className="text-subtle/60 tabular-nums">{t.count}</span>
            </Link>
          ))}
        </div>
      </section>

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
