import { Link, useParams, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { MediaGrid } from '../components/MediaGrid'
import { NoteBody } from './Projet'
import { fmtDate, indexById, norm, type Note, type VaultData } from '../lib/vault'

export function NotesList({ data }: { data: VaultData }) {
  const [q, setQ] = useState('')
  const [showMeta, setShowMeta] = useState(false)

  const groups = useMemo(() => {
    const term = norm(q.trim())
    const pool = data.notes
      .filter((n) => showMeta || !n.isMeta)
      .filter((n) => !term || norm(n.title + ' ' + n.path).includes(term))
    const map = new Map<string, Note[]>()
    for (const n of pool) {
      const k = n.domain
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    return [...map.entries()]
      .map(([k, v]) => [k, v.sort((a, b) => Number(b.isIndex) - Number(a.isIndex) || a.title.localeCompare(b.title))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [data, q, showMeta])

  return (
    <>
      <PageHead
        eyebrow="Notes"
        title="Le texte du vault"
        desc="Toutes les notes markdown, groupées par domaine. Les index (MOC) sont marqués."
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <div className="flex flex-wrap gap-3 items-center mb-10">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer par titre ou chemin…"
            className="h-11 px-4 rounded-lg border border-border bg-transparent outline-none text-[14px] focus:border-brand/40 transition-colors min-w-[260px] flex-1 max-w-md placeholder:text-subtle/60"
          />
          <button
            onClick={() => setShowMeta((v) => !v)}
            className={`label px-3.5 py-2.5 rounded-full transition-colors ${
              showMeta ? 'bg-brand text-white' : 'bg-surface text-subtle hover:text-foreground'
            }`}
          >
            templates & doc
          </button>
        </div>

        {groups.length === 0 ? (
          <Empty title="Aucune note ne correspond" />
        ) : (
          <div className="space-y-12">
            {groups.map(([domain, notes]) => (
              <section key={domain}>
                <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
                  <h2 className="label uppercase tracking-wide">{domain}</h2>
                  <span className="caption text-subtle tabular-nums">{notes.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {notes.map((n) => (
                    <Link
                      key={n.id}
                      to={`/note/${n.id.split('/').map(encodeURIComponent).join('/')}`}
                      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="label truncate">{n.title}</span>
                        {n.isIndex && (
                          <span className="caption px-1.5 py-1 rounded bg-surface-strong text-subtle shrink-0">
                            index
                          </span>
                        )}
                      </div>
                      <p className="caption text-subtle line-clamp-2 leading-[1.6] mb-3">{n.excerpt || '—'}</p>
                      <div className="flex items-center gap-3 caption text-subtle/60">
                        <span className="mono">{fmtDate(n.mtime)}</span>
                        {n.media.length > 0 && <span>{n.media.length} médias</span>}
                        {n.backlinks.length > 0 && <span>{n.backlinks.length} backlinks</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function NoteView({ data }: { data: VaultData }) {
  const params = useParams()
  const navigate = useNavigate()
  const idx = indexById(data)

  // Le chemin peut contenir des « / » : on récupère le reste de l'URL.
  const raw = params['*'] ?? ''
  const id = decodeURIComponent(raw)
  const note = idx.notes.get(id) || data.notes.find((n) => n.id === id || n.slug === id)

  if (!note)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Note introuvable" hint={id} />
      </div>
    )

  const media = note.media.map((i) => idx.media.get(i)!).filter(Boolean)
  const backlinks = note.backlinks.map((i) => idx.notes.get(i)!).filter(Boolean)
  const links = note.links.map((i) => idx.notes.get(i)!).filter(Boolean)

  const fm = Object.entries(note.frontmatter).filter(
    ([k]) => !['title', 'tags', 'cssclasses'].includes(k)
  )

  /** Les liens internes générés par l'indexeur restent dans la SPA. */
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (a.getAttribute('data-internal') === '1' || href.startsWith('/note/')) {
      e.preventDefault()
      navigate(href)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-12 pb-24">
      <div className="caption text-subtle mono mb-8 truncate">{note.path}</div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_270px] gap-12 lg:gap-16">
        <article onClick={onClick} className="min-w-0">
          <NoteBody id={note.id} media={idx.media} />

          {media.length > 0 && (
            <section className="mt-16 pt-10 border-t border-border">
              <div className="caption uppercase text-subtle mb-6">Médias de la note ({media.length})</div>
              <MediaGrid items={media} />
            </section>
          )}
        </article>

        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          {note.tags.length > 0 && (
            <Block title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((t) => (
                  <Link
                    key={t}
                    to={`/tags/${encodeURIComponent(t)}`}
                    className="caption px-2 py-1.5 rounded-full bg-surface text-subtle hover:bg-surface-strong hover:text-foreground transition-colors"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            </Block>
          )}

          {fm.length > 0 && (
            <Block title="Propriétés">
              <dl className="space-y-2.5">
                {fm.map(([k, v]) => (
                  <div key={k}>
                    <dt className="caption uppercase text-subtle/60">{k}</dt>
                    <dd className="caption text-subtle mt-1 break-words leading-[1.5]">
                      {Array.isArray(v) ? v.join(' · ') : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Block>
          )}

          {links.length > 0 && (
            <Block title={`Liens sortants (${links.length})`}>
              <NoteLinks notes={links} />
            </Block>
          )}

          {backlinks.length > 0 && (
            <Block title={`Backlinks (${backlinks.length})`}>
              <NoteLinks notes={backlinks} />
            </Block>
          )}

          <Block title="Fichier">
            <p className="caption text-subtle mono leading-relaxed break-all">
              {note.path}
              <br />
              {fmtDate(note.mtime)}
            </p>
          </Block>
        </aside>
      </div>
    </div>
  )
}

function NoteLinks({ notes }: { notes: Note[] }) {
  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            to={`/note/${n.id.split('/').map(encodeURIComponent).join('/')}`}
            className="caption text-subtle hover:text-foreground transition-colors block truncate"
          >
            {n.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="caption uppercase text-subtle mb-3.5 pb-2.5 border-b border-border">{title}</div>
      {children}
    </div>
  )
}

export function TagsList({ data }: { data: VaultData }) {
  return (
    <>
      <PageHead eyebrow="Tags" title="Par étiquette" desc="Les tags du frontmatter et ceux posés dans le corps des notes." />
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <div className="flex flex-wrap gap-2">
          {data.tags.map((t) => (
            <Link
              key={t.name}
              to={`/tags/${encodeURIComponent(t.name)}`}
              className="label px-4 py-2.5 rounded-full bg-surface text-subtle hover:bg-surface-strong hover:text-foreground transition-colors"
            >
              #{t.name} <span className="text-subtle/60 tabular-nums ml-1">{t.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

export function TagView({ data }: { data: VaultData }) {
  const { tag } = useParams()
  const name = decodeURIComponent(tag || '')
  const notes = data.notes.filter((n) => n.tags.includes(name))

  return (
    <>
      <PageHead eyebrow="Tag" title={`#${name}`} desc={`${notes.length} note${notes.length > 1 ? 's' : ''}`} />
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {notes.length === 0 ? (
          <Empty title="Aucune note avec ce tag" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {notes.map((n) => (
              <Link
                key={n.id}
                to={`/note/${n.id.split('/').map(encodeURIComponent).join('/')}`}
                className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
              >
                <div className="caption uppercase text-subtle mb-3 truncate">{n.folder || 'racine'}</div>
                <div className="label mb-2">{n.title}</div>
                <p className="caption text-subtle line-clamp-2 leading-[1.6]">{n.excerpt}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
