import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { displaySrc, indexById, norm, type Livre, type Media, type VaultData } from '../lib/vault'
import {
  STATUTS,
  baseConfiguree,
  chercherOpenLibrary,
  creerLivre,
  lireLivre,
  listerLivres,
  modifierLivre,
  supprimerLivre,
  versLivre,
  type LivreDb,
  type LivrePatch,
  type Statut,
  type Suggestion,
} from '../lib/livres-db'

/**
 * Les livres : ce que je lis, et surtout ce que j'en garde.
 *
 * Deux sources, une seule étagère. Les livres ajoutés sur le site vivent dans
 * la table Supabase `livres` et s'éditent ici même (`/livres/:id`). Les fiches
 * `type: livre` du vault, relevées par l'indexeur, s'affichent à côté et
 * s'ouvrent sur leur note — on les modifie dans Obsidian.
 */

const lienDe = (l: Livre) =>
  l.id ? `/livres/${l.id}` : `/note/${(l.noteId ?? '').split('/').map(encodeURIComponent).join('/')}`

const aujourdhui = () => new Date().toISOString().slice(0, 10)

export function Livres({ data }: { data: VaultData }) {
  const idx = indexById(data)
  const navigate = useNavigate()
  const [base, setBase] = useState<Livre[] | null>(baseConfiguree ? null : [])
  const [erreur, setErreur] = useState<string | null>(null)
  const [ajout, setAjout] = useState(false)

  useEffect(() => {
    if (!baseConfiguree) return
    listerLivres()
      .then((rows) => setBase(rows.map(versLivre)))
      .catch((e) => {
        setErreur(String(e.message ?? e))
        setBase([])
      })
  }, [])

  const livres = useMemo(() => [...(base ?? []), ...(data.livres ?? [])], [base, data.livres])

  const enCours = livres.filter((l) => l.statut === 'en cours')
  const lus = useMemo(
    () =>
      livres
        .filter((l) => l.statut === 'lu')
        .sort((a, b) => (b.fin ?? '').localeCompare(a.fin ?? '') || b.mtime - a.mtime),
    [livres]
  )
  const aLire = livres.filter((l) => l.statut === 'à lire')

  // Les idées de tous les livres, les livres retouchés le plus récemment d'abord.
  const idees = useMemo(
    () =>
      [...livres]
        .sort((a, b) => b.mtime - a.mtime)
        .flatMap((l) => l.appris.map((texte) => ({ texte, livre: l }))),
    [livres]
  )
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
    <button
      onClick={() => setAjout(true)}
      disabled={!baseConfiguree || !!erreur}
      className="label inline-flex items-center gap-2 h-11 px-5 rounded-full bg-brand text-white hover:bg-brand/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span aria-hidden>+</span> Ajouter un livre
    </button>
  )

  return (
    <>
      <PageHead
        eyebrow="Livres"
        title="Ce que je lis, et ce que j'en garde."
        desc="Ajoute un livre, puis note ce que tu en retiens au fil de la lecture. Tes idées, tous livres confondus, remontent ici."
        right={bouton}
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        {(erreur || !baseConfiguree) && (
          <div className="mb-10 rounded-xl border border-border bg-surface px-5 py-4 text-[14px] leading-relaxed text-muted">
            {erreur ?? 'La base des livres n’est pas branchée sur ce déploiement : il manque VITE_SUPABASE_URL et VITE_SUPABASE_KEY.'}
          </div>
        )}

        {base === null ? (
          <div className="caption text-subtle animate-pulse">Chargement des livres…</div>
        ) : livres.length === 0 ? (
          <Empty
            title="Aucun livre pour l'instant"
            hint="« Ajouter un livre » : tape le titre, choisis-le dans la liste, et la fiche s'ouvre. Note ce que tu retiens sous « Ce que j'ai appris », une idée par ligne."
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
                      key={l.id ?? l.noteId}
                      to={lienDe(l)}
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

            {idees.length > 0 && <Idees idees={idees} />}

            {aFaire.length > 0 && (
              <section>
                <Titre titre="À appliquer" n={aFaire.reduce((a, x) => a + x.taches.length, 0)} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aFaire.map(({ livre, taches }) => (
                    <Link
                      key={livre.id ?? livre.noteId}
                      to={lienDe(livre)}
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

            <Etagere titre="Lus" livres={lus} media={idx.media} />
            <Etagere titre="À lire" livres={aLire} media={idx.media} />
          </div>
        )}
      </div>

      {ajout && <Ajout onClose={() => setAjout(false)} onCree={(id) => navigate(`/livres/${id}`)} />}
    </>
  )
}

function Titre({ titre, n, right }: { titre: string; n?: number; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-4 mb-6 pb-4 border-b border-border">
      <h2 className="display-md">{titre}</h2>
      {n !== undefined && <span className="caption text-subtle tabular-nums">{n}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  )
}

/**
 * Le cœur de la page : une idée par ligne, avec le livre d'où elle vient. On en
 * montre douze, le reste se déplie, et le filtre cherche dans les idées comme
 * dans les titres et les auteurs.
 */
function Idees({ idees }: { idees: { texte: string; livre: Livre }[] }) {
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
                to={lienDe(i.livre)}
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

function Etagere({ titre, livres, media }: { titre: string; livres: Livre[]; media: Map<string, Media> }) {
  if (!livres.length) return null
  return (
    <section>
      <Titre titre={titre} n={livres.length} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-10">
        {livres.map((l) => (
          <Link key={l.id ?? l.noteId} to={lienDe(l)} className="group block min-w-0">
            <Couverture livre={l} media={media} />
            <div className="mt-3.5 label leading-tight group-hover:text-brand transition-colors line-clamp-2">
              {l.titre}
            </div>
            {l.auteur && <div className="caption text-subtle mt-1.5 truncate">{l.auteur}</div>}
            <div className="caption text-subtle/70 mt-2 flex items-center gap-2">
              {l.note !== null && <Points n={l.note} />}
              {l.statut === 'lu' && l.fin && <span>{fmtJour(l.fin)}</span>}
              {l.statut === 'à lire' && l.recommandePar && (
                <span className="truncate">conseillé par {l.recommandePar}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** La note sur 5, en points : lisible d'un coup d'œil, sans pictogramme. */
function Points({ n, onChange }: { n: number | null; onChange?: (n: number | null) => void }) {
  if (!onChange)
    return (
      <span className="flex gap-[3px]" aria-label={`${n} sur 5`} title={`${n}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`w-1.5 h-1.5 rounded-full ${n !== null && i <= n ? 'bg-brand' : 'bg-surface-strong'}`} />
        ))}
      </span>
    )
  return (
    <span className="flex gap-1" role="radiogroup" aria-label="Note sur 5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          role="radio"
          aria-checked={n === i}
          aria-label={`${i} sur 5`}
          onClick={() => onChange(n === i ? null : i)}
          className="p-1 -m-0.5 group"
        >
          <span
            className={`block w-3 h-3 rounded-full transition-colors ${
              n !== null && i <= n ? 'bg-brand' : 'bg-surface-strong group-hover:bg-brand/30'
            }`}
          />
        </button>
      ))}
    </span>
  )
}

/**
 * La couverture quand le livre en a une, sinon une couverture dessinée : le
 * titre posé sur un aplat. Même format pour les deux, pour que l'étagère se
 * lise comme une série.
 */
function Couverture({ livre, media, className = '' }: { livre: Livre; media?: Map<string, Media>; className?: string }) {
  const m = livre.couverture?.media ? media?.get(livre.couverture.media) : undefined
  const src = m ? displaySrc(m, 'thumb') : livre.couverture?.url
  const [casse, setCasse] = useState(false)
  useEffect(() => setCasse(false), [src])
  return (
    <div className={`aspect-[2/3] rounded-lg overflow-hidden bg-surface-strong ${className}`}>
      {src && !casse ? (
        <img
          src={src}
          alt={livre.titre}
          loading="lazy"
          decoding="async"
          onError={() => setCasse(true)}
          className="w-full h-full object-cover"
        />
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

// ------------------------------------------------------------------ ajout

/**
 * Ajouter un livre : on tape le titre, Open Library propose, un clic remplit
 * titre, auteur et couverture. Rien n'oblige à choisir une proposition — un
 * livre introuvable s'ajoute avec ce qui a été tapé.
 */
function Ajout({ onClose, onCree }: { onClose: () => void; onCree: (id: string) => void }) {
  const [titre, setTitre] = useState('')
  const [auteur, setAuteur] = useState('')
  const [couverture, setCouverture] = useState<string | null>(null)
  const [statut, setStatut] = useState<Statut>('en cours')
  const [props, setProps] = useState<Suggestion[]>([])
  const [choisi, setChoisi] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Propositions : après une courte pause dans la frappe, jamais une fois choisi.
  useEffect(() => {
    if (choisi || titre.trim().length < 3) return setProps([])
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      chercherOpenLibrary(titre.trim(), ctrl.signal).then(setProps).catch(() => {})
    }, 350)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [titre, choisi])

  const choisir = (s: Suggestion) => {
    setTitre(s.titre)
    setAuteur(s.auteur ?? '')
    setCouverture(s.couverture)
    setChoisi(true)
    setProps([])
  }

  const valider = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titre.trim() || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      const l = await creerLivre({
        titre: titre.trim(),
        auteur: auteur.trim() || null,
        couverture,
        statut,
        debut: statut !== 'à lire' ? aujourdhui() : null,
        fin: statut === 'lu' ? aujourdhui() : null,
      })
      onCree(l.id)
    } catch (err) {
      setErreur(String((err as Error).message ?? err))
      setEnvoi(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-brand/25 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={valider}
        className="relative w-full max-w-xl bg-background rounded-2xl border border-border shadow-[0_24px_70px_-24px_rgba(0,8,46,0.5)] p-6 sm:p-7"
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="display-md">Ajouter un livre</h2>
          <button type="button" onClick={onClose} className="caption text-subtle hover:text-foreground">
            Fermer
          </button>
        </div>

        <div className="flex gap-5">
          {couverture && (
            <img src={couverture} alt="" className="w-20 aspect-[2/3] object-cover rounded-md shrink-0 bg-surface-strong" />
          )}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="relative">
              <Champ label="Titre">
                <input
                  ref={inputRef}
                  value={titre}
                  onChange={(e) => {
                    setTitre(e.target.value)
                    setChoisi(false)
                  }}
                  placeholder="Commence à taper…"
                  className={champ}
                />
              </Champ>
              {props.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1.5 bg-background border border-border rounded-xl shadow-[0_16px_40px_-20px_rgba(0,8,46,0.45)] overflow-hidden max-h-80 overflow-y-auto">
                  {props.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => choisir(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface transition-colors"
                      >
                        <span className="w-8 aspect-[2/3] rounded bg-surface-strong overflow-hidden shrink-0">
                          {s.couverture && (
                            <img src={s.couverture.replace('-L.jpg', '-S.jpg')} alt="" className="w-full h-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="label block truncate">{s.titre}</span>
                          <span className="caption text-subtle block truncate mt-1">
                            {[s.auteur, s.annee].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Champ label="Auteur">
              <input value={auteur} onChange={(e) => setAuteur(e.target.value)} className={champ} />
            </Champ>
          </div>
        </div>

        <div className="mt-5">
          <SelecteurStatut valeur={statut} onChange={setStatut} />
        </div>

        {erreur && <p className="mt-4 caption text-[#d92d5e] leading-relaxed">{erreur}</p>}

        <div className="mt-7 flex justify-end">
          <button
            type="submit"
            disabled={!titre.trim() || envoi}
            className="label h-11 px-6 rounded-full bg-brand text-white hover:bg-brand/85 transition-colors disabled:opacity-40"
          >
            {envoi ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </form>
    </div>
  )
}

const champ =
  'w-full h-10 px-3 rounded-lg border border-border bg-transparent outline-none text-[14px] focus:border-brand/40 transition-colors placeholder:text-subtle/60'

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="caption uppercase text-subtle block mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function SelecteurStatut({ valeur, onChange }: { valeur: Statut; onChange: (s: Statut) => void }) {
  return (
    <div className="inline-flex p-1 rounded-full bg-surface" role="radiogroup" aria-label="Statut">
      {STATUTS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={valeur === s}
          onClick={() => onChange(s)}
          className={`label px-4 py-2 rounded-full transition-colors ${
            valeur === s ? 'bg-background text-foreground shadow-sm' : 'text-subtle hover:text-foreground'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------- fiche livre

/**
 * La fiche d'un livre ajouté sur le site, modifiable sur place : chaque
 * changement part dans la base après une courte pause, sans bouton
 * « enregistrer ».
 */
export function LivreView() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [l, setL] = useState<LivreDb | null | undefined>(undefined)
  const [etat, setEtat] = useState<'ok' | 'attente' | 'envoi' | 'erreur'>('ok')
  const enAttente = useRef<LivrePatch>({})
  const minuteur = useRef<number | undefined>(undefined)

  useEffect(() => {
    lireLivre(id)
      .then(setL)
      .catch(() => setL(null))
  }, [id])

  const envoyer = useCallback(async () => {
    window.clearTimeout(minuteur.current)
    const patch = enAttente.current
    if (!Object.keys(patch).length) return
    enAttente.current = {}
    setEtat('envoi')
    try {
      await modifierLivre(id, patch)
      setEtat(Object.keys(enAttente.current).length ? 'attente' : 'ok')
    } catch {
      // On remet le patch en file : le prochain changement le renverra.
      enAttente.current = { ...patch, ...enAttente.current }
      setEtat('erreur')
    }
  }, [id])

  // Rien ne se perd en quittant la page avant la fin de la pause.
  useEffect(() => () => void envoyer(), [envoyer])

  const maj = (patch: LivrePatch) => {
    setL((cur) => (cur ? { ...cur, ...patch } : cur))
    enAttente.current = { ...enAttente.current, ...patch }
    setEtat('attente')
    window.clearTimeout(minuteur.current)
    minuteur.current = window.setTimeout(envoyer, 700)
  }

  if (l === undefined) return <div className="caption text-subtle p-8 animate-pulse">Chargement…</div>
  if (l === null)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Livre introuvable" hint="Il a peut-être été supprimé." />
      </div>
    )

  const changerStatut = (statut: Statut) =>
    maj({
      statut,
      ...(statut !== 'à lire' && !l.debut ? { debut: aujourdhui() } : {}),
      ...(statut === 'lu' && !l.fin ? { fin: aujourdhui() } : {}),
    })

  const supprimer = async () => {
    if (!window.confirm(`Supprimer « ${l.titre} » ? C'est définitif.`)) return
    window.clearTimeout(minuteur.current)
    enAttente.current = {}
    await supprimerLivre(l.id)
    navigate('/livres')
  }

  const libelleEtat = { ok: 'Enregistré', attente: 'Modifié…', envoi: 'Enregistrement…', erreur: 'Non enregistré — nouvel essai au prochain changement' }[etat]

  return (
    <div className="mx-auto max-w-[1100px] px-5 sm:px-8 pt-10 pb-24">
      <div className="flex items-center justify-between gap-4 mb-10">
        <Link to="/livres" className="label text-subtle hover:text-foreground transition-colors">
          ← Livres
        </Link>
        <span className={`caption ${etat === 'erreur' ? 'text-[#d92d5e]' : 'text-subtle/70'}`}>{libelleEtat}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-8 sm:gap-12">
        <div>
          <Couverture livre={versLivre(l)} className="w-40 sm:w-full" />
          <input
            value={l.couverture ?? ''}
            onChange={(e) => maj({ couverture: e.target.value.trim() || null })}
            placeholder="Adresse de la couverture"
            className={`${champ} mt-3 h-9 text-[12px]`}
          />
        </div>

        <div className="min-w-0">
          <TexteAuto
            valeur={l.titre}
            onChange={(v) => v.trim() && maj({ titre: v })}
            className="display-xl w-full"
            placeholder="Titre"
            uneLigne
          />
          <input
            value={l.auteur ?? ''}
            onChange={(e) => maj({ auteur: e.target.value || null })}
            placeholder="Auteur"
            className="mt-3 w-full bg-transparent outline-none text-[18px] font-semibold text-subtle placeholder:text-subtle/40"
          />

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <SelecteurStatut valeur={l.statut} onChange={changerStatut} />
            <div className="flex items-center gap-3">
              <span className="caption uppercase text-subtle">Note</span>
              <Points n={l.note} onChange={(note) => maj({ note })} />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Champ label="Genre">
              <input value={l.genre ?? ''} onChange={(e) => maj({ genre: e.target.value || null })} className={champ} />
            </Champ>
            <Champ label="Conseillé par">
              <input
                value={l.recommande_par ?? ''}
                onChange={(e) => maj({ recommande_par: e.target.value || null })}
                className={champ}
              />
            </Champ>
            <Champ label="Commencé le">
              <input type="date" value={l.debut ?? ''} onChange={(e) => maj({ debut: e.target.value || null })} className={champ} />
            </Champ>
            <Champ label="Fini le">
              <input type="date" value={l.fin ?? ''} onChange={(e) => maj({ fin: e.target.value || null })} className={champ} />
            </Champ>
          </div>
        </div>
      </div>

      <div className="mt-16 space-y-14">
        <section>
          <Titre titre="En une phrase" />
          <TexteAuto
            valeur={l.phrase ?? ''}
            onChange={(v) => maj({ phrase: v || null })}
            placeholder="Ce que dit le livre, si tu devais le résumer à quelqu'un."
            className="w-full text-[18px] leading-relaxed"
          />
        </section>

        <section>
          <Titre titre="Ce que j'ai appris" n={l.appris.length} />
          <Liste
            items={l.appris}
            onChange={(appris) => maj({ appris })}
            ajout="Une idée retenue, puis Entrée"
          />
        </section>

        <section>
          <Titre titre="Ce que je vais appliquer" n={l.appliquer.filter((t) => !t.fait).length} />
          <Taches items={l.appliquer} onChange={(appliquer) => maj({ appliquer })} />
        </section>

        <section>
          <Titre titre="Citations" n={l.citations.length} />
          <Liste items={l.citations} onChange={(citations) => maj({ citations })} ajout="Une citation, puis Entrée" citation />
        </section>

        <section>
          <Titre titre="Notes de lecture" />
          <TexteAuto
            valeur={l.notes ?? ''}
            onChange={(v) => maj({ notes: v || null })}
            placeholder="Tout le reste, en vrac."
            className="w-full text-[15px] leading-relaxed min-h-24"
          />
        </section>
      </div>

      <div className="mt-20 pt-8 border-t border-border">
        <button onClick={supprimer} className="caption text-subtle hover:text-[#d92d5e] transition-colors">
          Supprimer ce livre
        </button>
      </div>
    </div>
  )
}

/** Un champ de texte qui grandit avec son contenu, sans cadre : on écrit sur la page. */
function TexteAuto({
  valeur,
  onChange,
  placeholder,
  className = '',
  uneLigne = false,
  onEntree,
  autoFocus,
}: {
  valeur: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  uneLigne?: boolean
  onEntree?: () => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Le titre se retape en entier : on garde la frappe locale pour qu'un titre
  // vidé le temps de le réécrire ne remonte pas à la base.
  const [local, setLocal] = useState(valeur)
  useEffect(() => setLocal(valeur), [valeur])
  useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight}px`
  }, [local])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={local}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => {
        const v = uneLigne ? e.target.value.replace(/\n/g, ' ') : e.target.value
        setLocal(v)
        onChange(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && (uneLigne || onEntree)) {
          e.preventDefault()
          onEntree?.()
        }
      }}
      className={`block resize-none overflow-hidden bg-transparent outline-none placeholder:text-subtle/40 ${className}`}
    />
  )
}

/** Une liste d'idées (ou de citations) : chaque ligne se réécrit sur place. */
function Liste({
  items,
  onChange,
  ajout,
  citation = false,
}: {
  items: string[]
  onChange: (items: string[]) => void
  ajout: string
  citation?: boolean
}) {
  const [nouveau, setNouveau] = useState('')
  const ajouter = () => {
    const t = nouveau.trim()
    if (!t) return
    onChange([...items, t])
    setNouveau('')
  }
  return (
    <div>
      {items.length > 0 && (
        <ol className="divide-y divide-border border-b border-border mb-3">
          {items.map((it, i) => (
            <li key={i} className="group py-3 flex items-start gap-4">
              <span className={`caption tabular-nums pt-[5px] w-5 shrink-0 ${citation ? 'text-brand/40' : 'text-subtle/50'}`}>
                {citation ? '“' : i + 1}
              </span>
              <TexteAuto
                valeur={it}
                onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))}
                className={`flex-1 text-[15px] leading-relaxed ${citation ? 'italic' : ''}`}
              />
              <button
                onClick={() => onChange(items.filter((_, k) => k !== i))}
                className="caption text-subtle/0 group-hover:text-subtle hover:!text-[#d92d5e] focus:text-subtle transition-colors pt-[5px]"
                aria-label="Retirer"
              >
                Retirer
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-start gap-4 py-2">
        <span className="caption text-subtle/50 pt-[5px] w-5 shrink-0">+</span>
        <TexteAuto
          valeur={nouveau}
          onChange={setNouveau}
          onEntree={ajouter}
          placeholder={ajout}
          className="flex-1 text-[15px] leading-relaxed"
        />
      </div>
    </div>
  )
}

function Taches({
  items,
  onChange,
}: {
  items: { texte: string; fait: boolean }[]
  onChange: (items: { texte: string; fait: boolean }[]) => void
}) {
  const [nouveau, setNouveau] = useState('')
  const ajouter = () => {
    const t = nouveau.trim()
    if (!t) return
    onChange([...items, { texte: t, fait: false }])
    setNouveau('')
  }
  return (
    <div>
      {items.length > 0 && (
        <ul className="divide-y divide-border border-b border-border mb-3">
          {items.map((t, i) => (
            <li key={i} className="group py-3 flex items-start gap-4">
              <input
                type="checkbox"
                checked={t.fait}
                onChange={() => onChange(items.map((x, k) => (k === i ? { ...x, fait: !x.fait } : x)))}
                className="mt-[5px] w-4 h-4 accent-[var(--c-night)] shrink-0"
              />
              <TexteAuto
                valeur={t.texte}
                onChange={(v) => onChange(items.map((x, k) => (k === i ? { ...x, texte: v } : x)))}
                className={`flex-1 text-[15px] leading-relaxed ${t.fait ? 'line-through text-subtle' : ''}`}
              />
              <button
                onClick={() => onChange(items.filter((_, k) => k !== i))}
                className="caption text-subtle/0 group-hover:text-subtle hover:!text-[#d92d5e] focus:text-subtle transition-colors pt-[5px]"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-4 py-2">
        <span className="caption text-subtle/50 pt-[5px] w-4 shrink-0 text-center">+</span>
        <TexteAuto
          valeur={nouveau}
          onChange={setNouveau}
          onEntree={ajouter}
          placeholder="Une chose à essayer, puis Entrée"
          className="flex-1 text-[15px] leading-relaxed"
        />
      </div>
    </div>
  )
}
