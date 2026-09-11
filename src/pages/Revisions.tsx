import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import {
  PAQUET_PERSO,
  chargerPerso,
  chargerProgression,
  clePaquet,
  compter,
  enregistrerPerso,
  enregistrerProgression,
  estDue,
  fusionner,
  delai,
  etiquette,
  fmtDelai,
  idPerso,
  melanger,
  planifier,
  REPONSES,
  revientDansLaSession,
  usePaquets,
  versAnki,
  type Carte,
  type CartePerso,
  type EtatCarte,
  type Paquet,
  type Progression,
  type Reponse,
} from '../lib/flashcards'
import { COURS_DOMAIN, coursSections, coursUrl, type Note, type VaultData } from '../lib/vault'

/* --------------------------------------------------------------------------
   Les révisions — jouer les cartes que les fiches portent déjà.

   Chaque fiche d'UE finit par un bloc `## 🃏 Cartes à créer`, écrit au format
   d'import d'Anki (`Recto ; Verso ; Tags`). Ces cartes existaient donc, mais
   nulle part où les faire tourner sans passer par Anki : l'indexeur les relit
   (`scripts/flashcards.mjs`) et cette page les présente une par une, dans
   l'ordre que le SM-2 de `lib/flashcards.ts` décide — quatre réponses, et un
   délai propre à chaque carte, annoncé sur le bouton avant qu'on clique.

   Rien n'est saisi deux fois : la fiche reste la source. Ce qui naît ici — la
   progression, et les quelques cartes qu'on ajoute en révisant — vit dans le
   navigateur, parce que ce n'est pas du cours.
   -------------------------------------------------------------------------- */

const TEINTE = { du: '#c2761a', acquis: '#10b981' } as const

/* Une session dure un quart d'heure : au-delà on relit sans retenir, et le lot
   restant ne perd rien à attendre demain. Le minuteur ne coupe pas la carte en
   cours — il attend sa réponse, puis propose d'arrêter ou de rallonger. */
const DUREE_SESSION = 15 * 60 * 1000
const RALLONGE = 5 * 60 * 1000

export function Revisions({ data }: { data: VaultData }) {
  const paquetsVault = usePaquets()
  const [perso, setPerso] = useState<CartePerso[]>(() => chargerPerso())
  const [prog, setProg] = useState<Progression>(() => chargerProgression())
  const [choisis, setChoisis] = useState<Set<string> | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  // `?paquet=<id de fiche>` : c'est par là qu'une fiche envoie réviser ses
  // seules cartes, sans qu'on ait à décocher les autres en arrivant.
  const [params] = useSearchParams()
  const demande = params.get('paquet')

  /**
   * Le titre d'une fiche vient de l'index, pas du JSON des cartes : c'est
   * `lib/vault` qui rend aux notes de cours leur nom de fichier (les H1 des
   * fiches sont des titres de lecture, longs et décorés).
   */
  const paquets = useMemo(() => {
    if (!paquetsVault) return null
    const notes = new Map(data.notes.map((n) => [n.id, n]))
    const nommes = paquetsVault.map((p) => ({ ...p, titre: notes.get(p.noteId ?? '')?.title ?? p.titre }))
    return fusionner(nommes, perso)
  }, [paquetsVault, perso, data.notes])

  /** Au premier rendu, tout est sélectionné : on révise le semestre entier. */
  const selection = useMemo(() => {
    if (!paquets) return new Set<string>()
    if (choisis) return choisis
    const cles = paquets.map(clePaquet)
    return new Set(demande && cles.includes(demande) ? [demande] : cles)
  }, [paquets, choisis, demande])

  const retenues = useMemo(
    () => (paquets ?? []).filter((p) => selection.has(clePaquet(p))).flatMap((p) => p.cartes),
    [paquets, selection]
  )

  const toutes = useMemo(() => (paquets ?? []).flatMap((p) => p.cartes), [paquets])
  const total = useMemo(() => compter(toutes, prog), [toutes, prog])
  const compteChoix = useMemo(() => compter(retenues, prog), [retenues, prog])

  const noter = useCallback((carte: Carte, r: Reponse) => {
    setProg((p) => {
      const suivant = { ...p, [carte.id]: planifier(p[carte.id], r) }
      enregistrerProgression(suivant)
      return suivant
    })
  }, [])

  const lancer = (mode: 'dues' | 'toutes') => {
    const lot = mode === 'dues' ? retenues.filter((c) => estDue(prog[c.id])) : retenues
    if (lot.length === 0) return
    setSession({
      file: melanger(lot),
      faites: 0,
      sues: 0,
      ratees: new Set(),
      total: lot.length,
      fin: Date.now() + DUREE_SESSION,
    })
  }

  const ajouter = (c: CartePerso) => {
    const suivant = [...perso, c]
    setPerso(suivant)
    enregistrerPerso(suivant)
  }

  const supprimer = (id: string) => {
    const suivant = perso.filter((c) => c.id !== id)
    setPerso(suivant)
    enregistrerPerso(suivant)
  }

  const oublier = () => {
    setProg({})
    enregistrerProgression({})
  }

  if (!paquets)
    return (
      <>
        <PageHead eyebrow="Cours · Révision" title="Flashcards" />
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24 caption text-subtle animate-pulse">
          Chargement des cartes…
        </div>
      </>
    )

  if (paquets.length === 0)
    return (
      <>
        <PageHead eyebrow="Cours · Révision" title="Flashcards" />
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
          <Empty
            title="Aucune carte trouvée"
            hint={`Les cartes viennent du bloc « 🃏 Cartes à créer » des fiches de ${COURS_DOMAIN}. Relance npm run index après en avoir écrit une.`}
          />
        </div>
      </>
    )

  if (session)
    return (
      <Lecteur
        session={session}
        setSession={setSession}
        onRepondre={noter}
        prog={prog}
      />
    )

  return (
    <>
      <PageHead
        eyebrow="Cours · Révision"
        title="Flashcards"
        desc="Les cartes que les fiches portent déjà, jouées une par une. Quatre réponses, et un intervalle propre à chaque carte : le délai annoncé sur chaque bouton est celui qu'elle engage. Une session dure un quart d'heure. La progression reste dans ce navigateur."
        right={<ExportAnki cartes={retenues} />}
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <div className="flex flex-wrap gap-x-14 gap-y-6 pb-12 mb-14 border-b border-border">
          <Chiffre n={total.total} l="cartes" />
          <Chiffre n={total.dues} l="à revoir aujourd'hui" teinte={total.dues > 0 ? TEINTE.du : undefined} />
          <Chiffre n={total.neuves} l="jamais vues" />
          <Chiffre n={total.acquises} l="acquises" teinte={total.acquises > 0 ? TEINTE.acquis : undefined} />
        </div>

        <section>
          <Titre titre="Paquets" compte={paquets.length} />
          <p className="caption text-subtle leading-relaxed mb-6 max-w-2xl">
            Un paquet par fiche. Décoche ce que tu ne révises pas aujourd'hui — l'examen, lui, ne dira pas de quel
            cours vient la question.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {paquets.map((p) => (
              <CartePaquet
                key={clePaquet(p)}
                paquet={p}
                prog={prog}
                actif={selection.has(clePaquet(p))}
                note={data.notes.find((n) => n.id === p.noteId) ?? null}
                onToggle={() => {
                  const s = new Set(selection)
                  s.has(clePaquet(p)) ? s.delete(clePaquet(p)) : s.add(clePaquet(p))
                  setChoisis(s)
                }}
              />
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => lancer('dues')}
              disabled={compteChoix.dues === 0}
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              Réviser {compteChoix.dues} carte{compteChoix.dues > 1 ? 's' : ''}
            </button>
            <button
              onClick={() => lancer('toutes')}
              disabled={compteChoix.total === 0}
              className="label px-5 py-3 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 disabled:opacity-30 transition-colors"
            >
              Tout revoir ({compteChoix.total})
            </button>
            {compteChoix.dues === 0 && compteChoix.total > 0 && (
              <span className="caption text-subtle">Rien à revoir dans cette sélection — c'est à jour.</span>
            )}
          </div>
        </section>

        <Ajout data={data} onAjouter={ajouter} />

        {perso.length > 0 && (
          <section className="mt-20">
            <Titre titre="Mes cartes" compte={perso.length} />
            <ul className="divide-y divide-border border-y border-border">
              {perso.map((c) => (
                <li key={c.id} className="py-4 flex items-baseline gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="label">{c.recto}</div>
                    <div className="caption text-subtle mt-1.5 leading-[1.6]">{c.verso}</div>
                  </div>
                  <button
                    onClick={() => supprimer(c.id)}
                    className="caption text-subtle hover:text-foreground transition-colors shrink-0"
                  >
                    supprimer
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-20 pt-10 border-t border-border flex flex-wrap items-baseline gap-4 justify-between">
          <p className="caption text-subtle leading-relaxed max-w-xl">
            Les cartes viennent des fiches : pour en corriger une, corrige la fiche dans Obsidian, puis relance{' '}
            <span className="mono">npm run index</span>.
          </p>
          <button onClick={oublier} className="caption text-subtle hover:text-foreground transition-colors">
            Oublier ma progression
          </button>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ lecteur */

interface Session {
  /** Ce qui reste à jouer, la carte courante en tête. */
  file: Carte[]
  /** Cartes sorties de la session (leur prochain passage est à un autre jour). */
  faites: number
  /** Cartes sorties sans jamais avoir été ratées. */
  sues: number
  /** Les cartes ratées au moins une fois : elles ne comptent plus comme sues. */
  ratees: Set<string>
  /** Nombre de cartes distinctes du lot — une carte qui repasse ne le gonfle pas. */
  total: number
  /** L'horodatage où le quart d'heure expire (repoussé par une rallonge). */
  fin: number
}

function Lecteur({
  session,
  setSession,
  onRepondre,
  prog,
}: {
  session: Session
  setSession: (s: Session | null) => void
  onRepondre: (c: Carte, r: Reponse) => void
  prog: Progression
}) {
  const [montre, setMontre] = useState(false)
  // Le temps écoulé ne ferme pas la session lui-même : `fini` n'est posé qu'à la
  // réponse suivante, pour ne pas escamoter la carte qu'on est en train de lire.
  const [fini, setFini] = useState(false)
  const [reste, setReste] = useState(() => session.fin - Date.now())
  const carte = session.file[0]

  // Le compte à rebours se relit sur l'horloge plutôt qu'il ne se décrémente :
  // un onglet mis en veille ne le fait pas prendre du retard.
  useEffect(() => {
    setReste(session.fin - Date.now())
    const t = setInterval(() => setReste(session.fin - Date.now()), 1000)
    return () => clearInterval(t)
  }, [session.fin])

  const repondreEt = useCallback(
    (r: Reponse) => {
      if (!carte) return
      onRepondre(carte, r)
      setMontre(false)

      // C'est l'algorithme qui décide si la carte repasse aujourd'hui : tout ce
      // qui reste en apprentissage revient en fin de file, le reste sort.
      const etat = planifier(prog[carte.id], r)
      const revient = revientDansLaSession(etat)
      const reste = session.file.slice(1)
      const ratee = r === 'revoir' || session.ratees.has(carte.id)

      if (Date.now() >= session.fin) setFini(true)

      setSession({
        file: revient ? [...reste, carte] : reste,
        faites: session.faites + (revient ? 0 : 1),
        sues: session.sues + (!revient && !ratee ? 1 : 0),
        ratees: r === 'revoir' ? new Set(session.ratees).add(carte.id) : session.ratees,
        total: session.total,
        fin: session.fin,
      })
    },
    [carte, onRepondre, prog, session, setSession]
  )

  // Les mains restent sur le clavier : espace retourne la carte, 1 à 4 notent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setSession(null)
      // Sur le bilan, plus rien à noter : les touches ne répondent pas à notre place.
      if (fini) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        // Entrée sur une carte retournée vaut « Correct », comme dans Anki.
        return montre ? repondreEt('correct') : setMontre(true)
      }
      if (!montre) return
      const r = REPONSES.find((x) => x.touche === e.key)
      if (r) repondreEt(r.cle)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [montre, repondreEt, setSession, fini])

  // Deux façons de sortir : le lot est épuisé, ou le quart d'heure l'a arrêté.
  if (fini || !carte) {
    const interrompue = fini && session.file.length > 0
    const passees = session.faites
    const taux = passees > 0 ? Math.round((session.sues / passees) * 100) : 0
    const rallonger = () => {
      setFini(false)
      setSession({ ...session, fin: Date.now() + RALLONGE })
    }

    return (
      <div className="mx-auto max-w-[720px] px-5 sm:px-8 py-24 text-center">
        <div className="caption uppercase text-subtle mb-5">
          {interrompue ? 'Quinze minutes' : 'Session terminée'}
        </div>
        <h1 className="display-md mb-5">
          {interrompue ? `${passees} cartes sur ${session.total}` : `${session.total} cartes passées`}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-10">
          {interrompue
            ? `Le quart d'heure est écoulé — ${taux} % sues sans faute. Ce qui reste du lot ne perd rien à attendre demain, et la progression des cartes déjà notées est gardée.`
            : taux === 100
              ? 'Aucune carte ratée. Elles reviendront chacune à leur date.'
              : `${taux} % sues sans faute. Ce qui a été raté repasse dans les jours qui viennent.`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {interrompue && (
            <button
              onClick={rallonger}
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
            >
              Encore 5 minutes
            </button>
          )}
          <button
            onClick={() => setSession(null)}
            className={`label px-5 py-3 rounded-full transition-colors ${
              interrompue
                ? 'border border-border text-subtle hover:text-foreground hover:border-brand/30'
                : 'bg-brand text-background hover:opacity-80'
            }`}
          >
            Retour aux paquets
          </button>
        </div>
      </div>
    )
  }

  const etat = prog[carte.id]
  const avance = session.total > 0 ? (session.faites / session.total) * 100 : 0

  return (
    <div className="mx-auto max-w-[820px] px-5 sm:px-8 pt-12 pb-24">
      <div className="flex items-center justify-between gap-4 mb-8">
        <button onClick={() => setSession(null)} className="label text-subtle hover:text-foreground transition-colors">
          ← Quitter
        </button>
        <div className="flex items-baseline gap-4">
          <span className="caption text-subtle tabular-nums">
            {session.faites} / {session.total}
            {session.file.length > session.total - session.faites && (
              <span className="text-subtle/60"> · {session.file.length} en file</span>
            )}
          </span>
          <Chrono reste={reste} />
        </div>
      </div>

      <div className="h-px bg-border mb-14 overflow-hidden">
        <div className="h-px bg-brand transition-[width] duration-300" style={{ width: `${avance}%` }} />
      </div>

      {/* Le clic sur la carte la retourne, comme la barre d'espace : on révise
          à la souris comme au clavier. Une fois retournée, c'est aux quatre
          boutons de répondre — le clic ne choisit pas à notre place. */}
      <div
        onClick={() => setMontre(true)}
        className={`min-h-[280px] rounded-2xl border border-border p-8 sm:p-12 flex flex-col justify-center transition-colors ${
          montre ? '' : 'cursor-pointer hover:border-brand/30'
        }`}
      >
        <p className="display-md text-balance">{carte.recto}</p>

        {montre && (
          <>
            <div className="my-8 h-px bg-border" />
            <p className="text-[17px] leading-relaxed text-muted text-pretty">{carte.verso}</p>
          </>
        )}

        {carte.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-1.5">
            {carte.tags.map((t) => (
              <span key={t} className="caption px-2 py-1 rounded-full bg-surface text-subtle">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {montre ? (
          REPONSES.map((r) => (
            <Note key={r.cle} reponse={r} etat={etat} onClick={() => repondreEt(r.cle)} />
          ))
        ) : (
          <button
            onClick={() => setMontre(true)}
            className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
          >
            Voir la réponse <span className="opacity-60 ml-1.5">espace</span>
          </button>
        )}

        <span className="caption text-subtle ml-auto">{etiquette(etat)}</span>
      </div>
    </div>
  )
}

/**
 * Le quart d'heure qui reste. Il passe à l'orange dans les deux dernières
 * minutes, et une fois à zéro annonce la dernière carte : le minuteur laisse
 * toujours finir celle qui est à l'écran.
 */
function Chrono({ reste }: { reste: number }) {
  if (reste <= 0)
    return (
      <span className="caption tabular-nums" style={{ color: TEINTE.du }}>
        0:00 · dernière carte
      </span>
    )

  const s = Math.ceil(reste / 1000)
  const presse = reste <= 2 * 60 * 1000

  return (
    <span
      className={`caption tabular-nums ${presse ? '' : 'text-subtle'}`}
      style={presse ? { color: TEINTE.du } : undefined}
      title="Temps restant dans la session"
    >
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

/**
 * Un des quatre boutons de réponse, avec le délai qu'il engage.
 *
 * Le délai est la moitié de l'information : « Difficile » et « Correct » ne se
 * choisissent pas de la même façon quand l'un annonce 3 jours et l'autre 12.
 */
function Note({
  reponse,
  etat,
  onClick,
}: {
  reponse: (typeof REPONSES)[number]
  etat: EtatCarte | undefined
  onClick: () => void
}) {
  const quand = fmtDelai(delai(etat, reponse.cle))
  const fort = reponse.cle === 'correct'

  return (
    <button
      onClick={onClick}
      className={`label px-5 py-3 rounded-full transition-colors ${
        fort
          ? 'bg-brand text-background hover:opacity-80'
          : 'border border-border hover:border-brand/30 text-foreground'
      }`}
    >
      {reponse.label}
      <span className={`ml-2 tabular-nums ${fort ? 'opacity-60' : 'text-subtle'}`}>{quand}</span>
      <span className={`ml-2 ${fort ? 'opacity-40' : 'text-subtle/50'}`}>{reponse.touche}</span>
    </button>
  )
}

/* -------------------------------------------------------------- les paquets */

function CartePaquet({
  paquet,
  prog,
  actif,
  note,
  onToggle,
}: {
  paquet: Paquet
  prog: Progression
  actif: boolean
  note: Note | null
  onToggle: () => void
}) {
  const c = compter(paquet.cartes, prog)
  const part = c.total > 0 ? (c.acquises / c.total) * 100 : 0

  return (
    <div
      onClick={onToggle}
      role="checkbox"
      aria-checked={actif}
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      className={`rounded-xl border p-5 cursor-pointer transition-colors ${
        actif ? 'border-brand/30' : 'border-border opacity-50 hover:opacity-80'
      }`}
    >
      <div className="flex items-center gap-3 mb-3.5">
        <span
          className={`w-3.5 h-3.5 rounded-[4px] border shrink-0 ${
            actif ? 'bg-brand border-brand' : 'border-border'
          }`}
          aria-hidden
        />
        {paquet.ue && <span className="caption uppercase text-subtle">UE {paquet.ue}</span>}
        {paquet.periode !== null && <span className="caption text-subtle">période {paquet.periode}</span>}
        {note && (
          <Link
            to={coursUrl(note)}
            onClick={(e) => e.stopPropagation()}
            className="caption text-subtle hover:text-foreground transition-colors ml-auto shrink-0"
          >
            voir la fiche →
          </Link>
        )}
      </div>

      <div className="label mb-4">{paquet.titre}</div>

      <div className="h-px bg-border mb-4 overflow-hidden">
        <div className="h-px" style={{ width: `${part}%`, background: TEINTE.acquis }} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 caption">
        <Metrique n={c.total} l="cartes" />
        <Metrique n={c.dues} l="à revoir" teinte={c.dues > 0 ? TEINTE.du : undefined} />
        <Metrique n={c.acquises} l="acquises" teinte={c.acquises > 0 ? TEINTE.acquis : undefined} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- écrire une carte */

function Ajout({ data, onAjouter }: { data: VaultData; onAjouter: (c: CartePerso) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [recto, setRecto] = useState('')
  const [verso, setVerso] = useState('')
  const [tags, setTags] = useState('')
  const [cible, setCible] = useState<string>(PAQUET_PERSO)

  /** On peut rattacher une carte à n'importe quelle fiche d'UE, pas seulement
      à celles qui ont déjà un bloc de cartes. */
  const fiches = useMemo(() => coursSections(data).fiches, [data])

  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    if (!recto.trim() || !verso.trim()) return
    onAjouter({
      id: idPerso(),
      recto: recto.trim(),
      verso: verso.trim(),
      tags: tags.split(/[\s,]+/).filter(Boolean),
      noteId: cible === PAQUET_PERSO ? null : cible,
      cree: Date.now(),
    })
    setRecto('')
    setVerso('')
  }

  const champ = 'w-full rounded-xl border border-border bg-transparent px-4 py-3 text-[14px] focus:border-brand/40 focus:outline-none transition-colors'

  return (
    <section className="mt-20">
      <Titre titre="Écrire une carte" />
      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="label px-5 py-3 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
        >
          + Ajouter une carte
        </button>
      ) : (
        <form onSubmit={valider} className="max-w-2xl space-y-3">
          <p className="caption text-subtle leading-relaxed mb-5">
            Une carte écrite ici reste dans ce navigateur. Pour qu'elle vive dans le vault, écris-la plutôt dans le
            bloc « 🃏 Cartes à créer » de sa fiche — c'est le même format.
          </p>
          <input
            value={recto}
            onChange={(e) => setRecto(e.target.value)}
            placeholder="Recto — « Coût d'opportunité, définition ? »"
            className={champ}
            autoFocus
          />
          <textarea
            value={verso}
            onChange={(e) => setVerso(e.target.value)}
            placeholder="Verso — la réponse, sans raisonnement"
            rows={3}
            className={`${champ} resize-y`}
          />
          <div className="flex flex-wrap gap-3">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags — eco 11A"
              className={`${champ} flex-1 min-w-[180px]`}
            />
            <select value={cible} onChange={(e) => setCible(e.target.value)} className={`${champ} flex-1 min-w-[180px]`}>
              <option value={PAQUET_PERSO}>Mes cartes</option>
              {fiches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!recto.trim() || !verso.trim()}
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 disabled:opacity-30 transition-opacity"
            >
              Ajouter
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="caption text-subtle hover:text-foreground transition-colors"
            >
              fermer
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

/** Le lot sélectionné, au format d'import d'Anki — un fichier, un glisser-déposer. */
function ExportAnki({ cartes }: { cartes: Carte[] }) {
  const exporter = () => {
    const blob = new Blob([versAnki(cartes)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cartes-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={exporter}
      disabled={cartes.length === 0}
      className="label px-4 py-2.5 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 disabled:opacity-30 transition-colors"
    >
      Exporter pour Anki ({cartes.length})
    </button>
  )
}

/* ----------------------------------------------------------------- éléments */

function Metrique({ n, l, teinte }: { n: number; l: string; teinte?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tabular-nums" style={teinte ? { color: teinte } : undefined}>
        {n}
      </span>
      <span className="text-subtle/60">{l}</span>
    </span>
  )
}

function Chiffre({ n, l, teinte }: { n: number; l: string; teinte?: string }) {
  return (
    <div>
      <div className="display-md tabular-nums" style={teinte ? { color: teinte } : undefined}>
        {n}
      </div>
      <div className="caption uppercase text-subtle mt-2">{l}</div>
    </div>
  )
}

function Titre({ titre, compte }: { titre: string; compte?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
      <h2 className="label uppercase tracking-wide">{titre}</h2>
      {compte !== undefined && <span className="caption text-subtle tabular-nums">{compte}</span>}
    </div>
  )
}
