import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { Empty } from '../components/Layout'
import { Maths } from '../components/Maths'
import { useAnnales, useQcm, type Question } from '../lib/annales'

/* --------------------------------------------------------------------------
   Passer le QCM, au lieu de le lire.

   Les QCM de macro comptent 144 questions, dont la moitié attendent DEUX
   bonnes réponses : les lire dans l'ordre ne dit pas si on les sait. Ici on
   répond, on valide, on voit immédiatement ce qui est juste — et à la fin on
   peut ne rejouer que ce qu'on a raté, qui est le seul tas qui compte la
   veille d'un partiel.

   Une question dont le fichier ne donne pas la réponse n'est pas devinée :
   elle s'affiche comme telle, et elle ne compte pas dans le score.
   -------------------------------------------------------------------------- */

type Etat = { choix: string[]; valide: boolean }

const juste = (q: Question, choix: string[]) => {
  const bonnes = q.options.filter((o) => o.correcte).map((o) => o.lettre)
  return bonnes.length > 0 && bonnes.length === choix.length && bonnes.every((l) => choix.includes(l))
}

const corrigee = (q: Question) => q.options.some((o) => o.correcte)

export function QcmView() {
  const params = useParams()
  const id = `${params.matiere}/${params.slug}`
  const data = useAnnales()
  const qcm = useQcm(id)
  const epreuve = data?.epreuves.find((e) => e.id === id)

  const [theme, setTheme] = useState<string | null>(null)
  const [i, setI] = useState(0)
  const [etats, setEtats] = useState<Record<number, Etat>>({})
  const [fini, setFini] = useState(false)

  const questions = useMemo(
    () => (qcm?.questions ?? []).filter((q) => !theme || q.theme === theme),
    [qcm, theme]
  )

  // Changer de thème (ou de paquet) recommence la série : le rang n'a plus
  // le même sens d'une liste à l'autre.
  useEffect(() => {
    setI(0)
    setEtats({})
    setFini(false)
  }, [theme, id])

  if (qcm === undefined) return <Chargement />
  if (!qcm)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="QCM introuvable" hint={id} />
      </div>
    )

  const themes = [...new Set(qcm.questions.map((q) => q.theme).filter(Boolean))] as string[]
  const q = questions[i]
  const etat = q ? etats[q.n] : undefined

  const repondues = questions.filter((x) => etats[x.n]?.valide && corrigee(x))
  const bonnes = repondues.filter((x) => juste(x, etats[x.n].choix))
  const ratees = repondues.filter((x) => !juste(x, etats[x.n].choix))

  const basculer = (lettre: string) => {
    if (!q || etat?.valide) return
    const actuel = etats[q.n]?.choix ?? []
    const choix = q.multiple
      ? actuel.includes(lettre)
        ? actuel.filter((l) => l !== lettre)
        : [...actuel, lettre]
      : [lettre]
    setEtats((e) => ({ ...e, [q.n]: { choix, valide: false } }))
  }

  const valider = () => {
    if (!q) return
    setEtats((e) => ({ ...e, [q.n]: { choix: e[q.n]?.choix ?? [], valide: true } }))
  }

  const suivante = () => {
    if (i + 1 >= questions.length) setFini(true)
    else setI(i + 1)
  }

  const rejouerRatees = () => {
    const aGarder = new Set(ratees.map((x) => x.n))
    setEtats((e) =>
      Object.fromEntries(Object.entries(e).filter(([n]) => !aGarder.has(Number(n))))
    )
    const premier = questions.findIndex((x) => aGarder.has(x.n))
    setI(premier < 0 ? 0 : premier)
    setFini(false)
  }

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8 pt-12 pb-24">
      <div className="flex items-center justify-between gap-4 mb-10">
        <Link
          to={`/annales/${id}`}
          className="label text-subtle hover:text-foreground transition-colors"
        >
          ← {epreuve?.titre ?? 'L’épreuve'}
        </Link>
        <span className="caption text-subtle tabular-nums">
          {bonnes.length} / {repondues.length || 0} juste{bonnes.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="caption uppercase text-subtle mb-4">{qcm.matiere}</div>
      <h1 className="display-md mb-8">{qcm.titre}</h1>

      {themes.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-10">
          <Puce actif={theme === null} onClick={() => setTheme(null)}>
            Tout ({qcm.questions.length})
          </Puce>
          {themes.map((t) => (
            <Puce key={t} actif={theme === t} onClick={() => setTheme(t)}>
              {t} ({qcm.questions.filter((x) => x.theme === t).length})
            </Puce>
          ))}
        </div>
      )}

      {/* Barre de progression : où l'on en est dans la série en cours. */}
      <div className="h-1 rounded-full bg-surface mb-10 overflow-hidden">
        <div
          className="h-full bg-brand transition-[width] duration-300"
          style={{ width: `${questions.length ? ((fini ? questions.length : i) / questions.length) * 100 : 0}%` }}
        />
      </div>

      {fini || !q ? (
        <Bilan
          total={questions.length}
          bonnes={bonnes.length}
          ratees={ratees}
          etats={etats}
          onRejouer={rejouerRatees}
          onRecommencer={() => {
            setEtats({})
            setI(0)
            setFini(false)
          }}
        />
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="caption text-subtle mono tabular-nums">
              {i + 1} / {questions.length}
            </span>
            {q.multiple && (
              <span className="caption text-subtle">plusieurs réponses attendues</span>
            )}
            {!corrigee(q) && (
              <span className="caption" style={{ color: '#c2761a' }}>
                sans corrigé dans le fichier
              </span>
            )}
            {q.source && (
              <span className="caption" style={{ color: '#c2761a' }}>
                réponse reconstituée
              </span>
            )}
          </div>

          <p className="text-[17px] leading-relaxed mb-8">
            <Maths>{q.enonce}</Maths>
          </p>

          <div className="space-y-2.5">
            {q.options.map((o) => {
              const choisi = (etat?.choix ?? []).includes(o.lettre)
              const montre = etat?.valide && corrigee(q)
              const teinte = montre
                ? o.correcte
                  ? '#10b981'
                  : choisi
                    ? '#d92d5e'
                    : undefined
                : undefined
              return (
                <button
                  key={o.lettre}
                  onClick={() => basculer(o.lettre)}
                  disabled={etat?.valide}
                  className={`w-full text-left flex gap-3 items-start px-4 py-3.5 rounded-xl border transition-colors ${
                    choisi ? 'border-brand/50 bg-surface' : 'border-border hover:border-brand/30'
                  }`}
                  style={teinte ? { borderColor: teinte } : undefined}
                >
                  <span
                    className="caption mono uppercase shrink-0 pt-0.5"
                    style={teinte ? { color: teinte } : undefined}
                  >
                    {o.lettre}
                  </span>
                  <span className="text-[15px] leading-relaxed">
                    <Maths>{o.texte}</Maths>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {!etat?.valide ? (
              <button
                onClick={valider}
                disabled={!etat?.choix?.length}
                className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity disabled:opacity-30"
              >
                Valider
              </button>
            ) : (
              <button
                onClick={suivante}
                className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
              >
                {i + 1 >= questions.length ? 'Voir le bilan' : 'Question suivante'}
              </button>
            )}

            {etat?.valide && corrigee(q) && (
              <span className="caption" style={{ color: juste(q, etat.choix) ? '#10b981' : '#d92d5e' }}>
                {juste(q, etat.choix)
                  ? 'Juste.'
                  : `Attendu : ${q.options
                      .filter((o) => o.correcte)
                      .map((o) => o.lettre)
                      .join(', ')}`}
              </span>
            )}
            {etat?.valide && !corrigee(q) && (
              <span className="caption text-subtle">
                Le fichier ne dit pas la bonne réponse : cette question ne compte pas.
              </span>
            )}
          </div>

          {/* D'où vient la réponse, quand elle n'était pas dans le fichier :
              on la donne avec sa source plutôt que de la laisser tomber du
              ciel — et on peut la contester en lisant le même passage. */}
          {etat?.valide && q.source && (
            <p className="mt-6 caption text-subtle leading-relaxed border-l-2 border-border pl-4">
              Réponse retrouvée — {q.source}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Bilan({
  total,
  bonnes,
  ratees,
  etats,
  onRejouer,
  onRecommencer,
}: {
  total: number
  bonnes: number
  ratees: Question[]
  etats: Record<number, Etat>
  onRejouer: () => void
  onRecommencer: () => void
}) {
  const repondues = bonnes + ratees.length
  return (
    <div>
      <div className="flex flex-wrap gap-x-14 gap-y-6 pb-10 mb-10 border-b border-border">
        <div>
          <div className="display-md tabular-nums">
            {bonnes}
            <span className="text-subtle">/{repondues || total}</span>
          </div>
          <div className="caption uppercase text-subtle mt-2">réponses justes</div>
        </div>
        {ratees.length > 0 && (
          <div>
            <div className="display-md tabular-nums" style={{ color: '#d92d5e' }}>
              {ratees.length}
            </div>
            <div className="caption uppercase text-subtle mt-2">à revoir</div>
          </div>
        )}
      </div>

      {ratees.length > 0 && (
        <div className="space-y-6 mb-12">
          {ratees.map((q) => (
            <div key={q.n} className="border-l-2 pl-4" style={{ borderColor: '#d92d5e' }}>
              <p className="text-[15px] leading-relaxed mb-2">
                <Maths>{q.enonce}</Maths>
              </p>
              <p className="caption text-subtle">
                Répondu : {etats[q.n]?.choix.join(', ').toUpperCase() || '—'} · attendu :{' '}
                {q.options
                  .filter((o) => o.correcte)
                  .map((o) => o.lettre.toUpperCase())
                  .join(', ')}
              </p>
              <ul className="mt-2 space-y-1">
                {q.options
                  .filter((o) => o.correcte)
                  .map((o) => (
                    <li key={o.lettre} className="caption leading-relaxed" style={{ color: '#10b981' }}>
                      <Maths>{o.texte}</Maths>
                    </li>
                  ))}
              </ul>
              {q.source && (
                <p className="caption text-subtle/70 mt-2 leading-relaxed">{q.source}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        {ratees.length > 0 && (
          <button
            onClick={onRejouer}
            className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
          >
            Rejouer les {ratees.length} ratées
          </button>
        )}
        <button
          onClick={onRecommencer}
          className="label px-5 py-3 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
        >
          Tout recommencer
        </button>
      </div>
    </div>
  )
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`caption px-3 py-2 rounded-full transition-colors ${
        actif ? 'bg-surface-strong text-foreground' : 'bg-surface text-subtle hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

const Chargement = () => (
  <div className="mx-auto max-w-3xl px-5 sm:px-8 py-24 caption text-subtle animate-pulse">
    Chargement du QCM…
  </div>
)
