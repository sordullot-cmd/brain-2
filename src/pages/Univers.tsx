import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { MediaGrid } from '../components/MediaGrid'
import { indexById, type VaultData } from '../lib/vault'

export function UniversList({ data }: { data: VaultData }) {
  const idx = indexById(data)

  return (
    <>
      <PageHead
        eyebrow="Univers"
        title="Dossiers de référence"
        desc="Des univers créatifs entiers rapatriés en pleine qualité — branding, UI, character design, illustrations — pour que les références ne disparaissent jamais."
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {data.universes.length === 0 ? (
          <Empty title="Aucun univers" hint="Lance /univers avec un nom de jeu, de marque ou de studio." />
        ) : (
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
                    <h2 className="display-md group-hover:text-brand transition-colors">{u.title}</h2>
                    <span className="caption text-subtle tabular-nums ml-auto shrink-0">{u.count}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {u.categorie && <span className="caption uppercase text-subtle">{u.categorie}</span>}
                    {u.annee && <span className="caption text-subtle/60 mono">{u.annee}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export function UniversDetail({ data }: { data: VaultData }) {
  const { slug } = useParams()
  const idx = indexById(data)
  const u = data.universes.find((x) => x.slug === slug)
  const [aspect, setAspect] = useState<string>('tout')

  if (!u)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Univers introuvable" />
      </div>
    )

  const note = u.noteId ? idx.notes.get(u.noteId) : null
  const shown =
    aspect === 'tout'
      ? u.aspects.flatMap((a) => a.media)
      : (u.aspects.find((a) => a.name === aspect)?.media ?? [])
  const items = shown.map((id) => idx.media.get(id)!).filter(Boolean)

  return (
    <>
      <PageHead
        eyebrow={[u.categorie, u.secteur].filter(Boolean).join(' · ') || 'Univers'}
        title={u.title}
        desc={u.annee ? `Identité ${u.annee}` : undefined}
        right={
          u.source ? (
            <a
              href={u.source}
              target="_blank"
              rel="noreferrer"
              className="label px-4 py-2.5 rounded-lg border border-border hover:border-brand/40 transition-colors shrink-0"
            >
              Source ↗
            </a>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {/* Palette */}
        {u.couleurs.length > 0 && (
          <div className="mb-12">
            <div className="caption uppercase text-subtle mb-4">
              Palette{u.couleurPrincipale ? ` — ${u.couleurPrincipale}` : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              {u.couleurs.map((c, i) => (
                <div key={i} className="w-24">
                  <div className="h-16 rounded-lg border border-border" style={{ background: c }} />
                  <div className="caption text-subtle mt-2 mono">{c}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtres par aspect */}
        <div className="flex flex-wrap gap-2 mb-8 pb-6 border-b border-border">
          <Chip active={aspect === 'tout'} onClick={() => setAspect('tout')}>
            tout <span className="tabular-nums">{u.count}</span>
          </Chip>
          {u.aspects.map((a) => (
            <Chip key={a.name} active={aspect === a.name} onClick={() => setAspect(a.name)}>
              {a.name.replace(/-/g, ' ')} <span className="tabular-nums">{a.count}</span>
            </Chip>
          ))}
        </div>

        <MediaGrid items={items} />

        {/* Fiche */}
        {note && (
          <section className="mt-20 pt-12 border-t border-border">
            <div className="caption uppercase text-subtle mb-8">La fiche</div>
            <div className="max-w-3xl">
              <NoteBody html={note.html} />
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function Chip({
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
      className={`label px-3.5 py-2 rounded-lg transition-colors ${
        active ? 'bg-brand text-white' : 'bg-surface text-subtle hover:bg-surface-strong hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

/** Le HTML vient de notre propre indexeur (contenu local), pas d'une source tierce. */
export function NoteBody({ html }: { html: string }) {
  return <div className="prose-vault" dangerouslySetInnerHTML={{ __html: html }} />
}
