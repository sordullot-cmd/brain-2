import { Link } from 'react-router-dom'
import { PageHead, Empty } from '../components/Layout'
import { MediaGrid } from '../components/MediaGrid'
import { indexById, type VaultData } from '../lib/vault'

/**
 * Vue par discipline. Les disciplines vides sont affichées quand même : elles
 * font partie de l'architecture du vault et disent ce qu'il reste à remplir.
 */
export function Inspirations({ data }: { data: VaultData }) {
  const idx = indexById(data)
  const filled = data.disciplines.filter((d) => d.mediaCount > 0 || d.noteCount > 0)
  const empty = data.disciplines.filter((d) => d.mediaCount === 0 && d.noteCount === 0)

  return (
    <>
      <PageHead
        eyebrow="Inspirations"
        title="Rangé par discipline"
        desc="Sites, interfaces, identités, print et motion. Les composants et animations sont des index transversaux : les fichiers vivent dans le dossier de leur site."
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24 space-y-16">
        {filled.map((d) => {
          const media = d.media.map((id) => idx.media.get(id)!).filter(Boolean)
          const notes = d.notes.map((id) => idx.notes.get(id)!).filter(Boolean)
          return (
            <section key={d.name}>
              <div className="flex items-baseline justify-between gap-4 mb-6 pb-4 border-b border-border">
                <h2 className="display-md">{d.label}</h2>
                <span className="caption text-subtle tabular-nums shrink-0">
                  {d.mediaCount} médias · {d.noteCount} notes
                </span>
              </div>

              {notes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                  {notes.map((n) => (
                    <Link
                      key={n.id}
                      to={`/note/${n.id.split('/').map(encodeURIComponent).join('/')}`}
                      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
                    >
                      <div className="label mb-2">{n.title}</div>
                      <p className="caption text-subtle line-clamp-2 leading-[1.6]">{n.excerpt}</p>
                    </Link>
                  ))}
                </div>
              )}

              <MediaGrid items={media} />
            </section>
          )
        })}

        {empty.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between gap-4 mb-6 pb-4 border-b border-border">
              <h2 className="display-md text-subtle">Disciplines en attente</h2>
              <span className="caption text-subtle shrink-0">{empty.length} vides</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
              {empty.map((d) => (
                <div key={d.name} className="rounded-xl border border-dashed border-border px-5 py-6">
                  <div className="label text-subtle">{d.label}</div>
                  <div className="caption text-subtle/60 mt-2 mono">{d.path}</div>
                </div>
              ))}
            </div>

            <Empty
              title="Aucune inspiration rangée pour l'instant"
              hint="Ces dossiers existent dans le vault mais sont vides. Lance /inspi avec un lien de site ou de post pour les remplir — la galerie se met à jour au prochain npm run index."
            />
          </section>
        )}
      </div>
    </>
  )
}
