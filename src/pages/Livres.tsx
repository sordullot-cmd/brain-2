import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { displaySrc, indexById, norm, type Livre, type Media, type VaultData } from '../lib/vault'

/**
 * Les livres du vault : ce que je lis, et surtout ce que j'en garde. Chaque
 * fiche vit dans `LIVRES/` (modèle `Template-Livre`) ; la page ne fait que la
 * relire. On n'écrit pas ici — le site est statique — mais le bouton d'ajout
 * ouvre Obsidian directement sur la commande QuickAdd qui crée la fiche.
 */
export function Livres({ data }: { data: VaultData }) {
  const idx = indexById(data)
  const livres = data.livres ?? []
  const noteUrl = (l: Livre) => `/note/${l.noteId.split('/').map(encodeURIComponent).join('/')}`
  const ajouter = `obsidian://quickadd?vault=${encodeURIComponent(data.vaultName)}&choice=${encodeURIComponent('Ajouter un livre')}`

  const enCours = livres.filter((l) => l.statut === 'en cours')
  const lus = useMemo(
    () => livres.filter((l) => l.statut === 'lu').sort((a, b) => (b.fin ?? '').localeCompare(a.fin ?? '') || b.mtime - a.mtime),
    [livres]
  )
  const aLire = livres.filter((l) => l.statut === 'à lire')

  // Les idées de tous les livres, les fiches retouchées le plus récemment d'abord.
  const idees = useMemo(() => livres.flatMap((l) => l.appris.map((texte) => ({ texte, livre: l }))), [livres])
  const aFaire = livres
    .map((l) => ({ livre: l, taches: l.appliquer.filter((t) => !t.fait) }))
    .filter((x) => x.taches.length)

  const stats = [
    { n: lus.length, l: 'lus' },
    { n: enCours.length, l: 'en cours' },
    { n: aLire.length, l: 'à lire' },
    { n: idees.length, l: 'idées retenues' },
  ]

  const bouton = (
    <a
      href={ajouter}
      className="label inline-flex items-center gap-2 h-11 px-5 rounded-full bg-brand text-white hover:bg-brand/85 transition-colors"
    >
      <span aria-hidden>+</span> Ajouter un livre
    </a>
  )

  return (
    <>
      <PageHead
        eyebrow="Livres"
        title="Ce que je lis, et ce que j'en garde."
        desc="Une fiche par livre dans le vault. Ce que j'en ai appris remonte ici, tous livres confondus. Le bouton ouvre Obsidian pour créer la fiche."
        right={bouton}
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {livres.length === 0 ? (
          <Empty
            title="Aucun livre pour l'instant"
            hint="« Ajouter un livre » crée la fiche dans LIVRES/ depuis Obsidian. Note ce que tu retiens sous « Ce que j'ai appris », une idée par ligne : elle s'affichera ici au prochain déploiement."
          />
        ) : (
          <div className="space-y-20">
            <div className="flex flex-wrap gap-x-14 gap-y-6">
              {stats.map((s) => (
                <div key={s.l}>
                  <div className="display-md tabular-nums">{s.n}</div>
                  <div className="caption uppercase text-subtle mt-2">{s.l}</div>
                </div>
              ))}
            </div>

            {enCours.length > 0 && (
              <section>
                <Titre titre="En cours" n={enCours.length} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {enCours.map((l) => (
                    <Link
                      key={l.noteId}
                      to={noteUrl(l)}
                      className="group flex gap-5 rounded-2xl border border-border p-4 hover:border-brand/30 transition-colors"
                    >
                      <Couverture livre={l} media={idx.media} className="w-24 shrink-0" />
                      <div className="min-w-0 py-1 flex flex-col">
                        <div className="display-md group-hover:text-brand transition-colors">{l.titre}</div>
                        {l.auteur && <div className="label text-subtle mt-2.5">{l.auteur}</div>}
                        {l.phrase && <p className="text-[14px] leading-relaxed text-muted mt-4 line-clamp-3">{l.phrase}</p>}
                        <div className="caption text-subtle/70 mt-auto pt-4">
                          {l.debut ? `commencé le ${fmtJour(l.debut)}` : 'en cours'}
                          {l.appris.length > 0 && ` · ${l.appris.length} idée${l.appris.length > 1 ? 's' : ''}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {idees.length > 0 && <Idees idees={idees} noteUrl={noteUrl} />}

            {aFaire.length > 0 && (
              <section>
                <Titre titre="À appliquer" n={aFaire.reduce((a, x) => a + x.taches.length, 0)} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aFaire.map(({ livre, taches }) => (
                    <Link
                      key={livre.noteId}
                      to={noteUrl(livre)}
                      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors"
                    >
                      <div className="caption uppercase text-subtle mb-4 truncate">{livre.titre}</div>
                      <ul className="space-y-2.5">
                        {taches.map((t, i) => (
                          <li key={i} className="flex gap-3 text-[14px] leading-snug">
                            <span className="mt-[3px] w-3.5 h-3.5 rounded border border-brand/40 shrink-0" />
                            {t.texte}
                          </li>
                        ))}
                      </ul>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <Etagere titre="Lus" livres={lus} media={idx.media} noteUrl={noteUrl} />
            <Etagere titre="À lire" livres={aLire} media={idx.media} noteUrl={noteUrl} />
          </div>
        )}
      </div>
    </>
  )
}

function Titre({ titre, n, right }: { titre: string; n: number; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-4 mb-6 pb-4 border-b border-border">
      <h2 className="display-md">{titre}</h2>
      <span className="caption text-subtle tabular-nums">{n}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}

/**
 * Le cœur de la page : une idée par ligne, avec le livre d'où elle vient. On en
 * montre douze, le reste se déplie, et le filtre cherche dans les idées comme
 * dans les titres et les auteurs.
 */
function Idees({
  idees,
  noteUrl,
}: {
  idees: { texte: string; livre: Livre }[]
  noteUrl: (l: Livre) => string
}) {
  const [q, setQ] = useState('')
  const [tout, setTout] = useState(false)
  const term = norm(q.trim())
  const pool = term
    ? idees.filter((i) => norm(`${i.texte} ${i.livre.titre} ${i.livre.auteur ?? ''}`).includes(term))
    : idees
  const vues = tout || term ? pool : pool.slice(0, 12)

  return (
    <section>
      <Titre
        titre="Ce que j'ai appris"
        n={idees.length}
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher une idée…"
            className="h-9 px-3.5 rounded-lg border border-border bg-transparent outline-none text-[13px] focus:border-brand/40 transition-colors w-56 placeholder:text-subtle/60"
          />
        }
      />
      {vues.length === 0 ? (
        <Empty title="Aucune idée ne correspond" />
      ) : (
        <ol className="divide-y divide-border">
          {vues.map((i, k) => (
            <li key={k} className="py-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-x-8 gap-y-1.5">
              <p className="text-[15px] leading-relaxed text-pretty">{i.texte}</p>
              <Link
                to={noteUrl(i.livre)}
                className="caption text-subtle hover:text-foreground transition-colors sm:text-right sm:pt-1.5 truncate"
              >
                {i.livre.titre}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {!term && pool.length > 12 && (
        <button
          onClick={() => setTout((v) => !v)}
          className="label mt-5 px-3.5 py-2.5 rounded-full bg-surface text-subtle hover:text-foreground transition-colors"
        >
          {tout ? 'Replier' : `Voir les ${pool.length} idées`}
        </button>
      )}
    </section>
  )
}

function Etagere({
  titre,
  livres,
  media,
  noteUrl,
}: {
  titre: string
  livres: Livre[]
  media: Map<string, Media>
  noteUrl: (l: Livre) => string
}) {
  if (!livres.length) return null
  return (
    <section>
      <Titre titre={titre} n={livres.length} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-10">
        {livres.map((l) => (
          <Link key={l.noteId} to={noteUrl(l)} className="group block min-w-0">
            <Couverture livre={l} media={media} />
            <div className="mt-3.5 label leading-tight group-hover:text-brand transition-colors line-clamp-2">
              {l.titre}
            </div>
            {l.auteur && <div className="caption text-subtle mt-1.5 truncate">{l.auteur}</div>}
            <div className="caption text-subtle/70 mt-2 flex items-center gap-2">
              {l.note !== null && <Note n={l.note} />}
              {l.statut === 'lu' && l.fin && <span>{fmtJour(l.fin)}</span>}
              {l.statut === 'à lire' && l.recommandePar && <span className="truncate">conseillé par {l.recommandePar}</span>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** La note sur 5, en points : lisible d'un coup d'œil, sans pictogramme. */
function Note({ n }: { n: number }) {
  return (
    <span className="flex gap-[3px]" aria-label={`${n} sur 5`} title={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= n ? 'bg-brand' : 'bg-surface-strong'}`} />
      ))}
    </span>
  )
}

/**
 * La couverture quand la fiche en donne une, sinon une couverture dessinée :
 * le titre posé sur un aplat. Même format pour les deux, pour que l'étagère se
 * lise comme une série.
 */
function Couverture({ livre, media, className = '' }: { livre: Livre; media: Map<string, Media>; className?: string }) {
  const m = livre.couverture?.media ? media.get(livre.couverture.media) : undefined
  const src = m ? displaySrc(m, 'thumb') : livre.couverture?.url
  return (
    <div className={`aspect-[2/3] rounded-lg overflow-hidden bg-surface-strong ${className}`}>
      {src ? (
        <img src={src} alt={livre.titre} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full p-3.5 flex flex-col justify-between bg-brand text-white">
          <div className="label leading-tight line-clamp-5 text-pretty">{livre.titre}</div>
          {livre.auteur && <div className="caption opacity-60 line-clamp-2">{livre.auteur}</div>}
        </div>
      )}
    </div>
  )
}

const fmtJour = (j: string) =>
  new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
