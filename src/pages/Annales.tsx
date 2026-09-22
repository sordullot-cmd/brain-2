import { Link, useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { PageHead, Empty } from '../components/Layout'
import { Maths } from '../components/Maths'
import {
  epreuveUrl,
  fmtOctets,
  intitule,
  nbQuestions,
  parMatiere,
  useAnnales,
  type Epreuve,
  type PartieSujet,
} from '../lib/annales'

/* --------------------------------------------------------------------------
   Les annales — les sujets des années précédentes, lisibles ici.

   Une annale, jusqu'ici, c'était un PDF dans un dossier : on l'ouvrait, on
   regardait une image de page, et c'était tout. Or un sujet ne se regarde pas,
   il se traite. Ces pages le rendent donc sous sa forme utile : l'en-tête
   (durée, documents, consignes), les exercices, leurs questions et leur
   barème — et, pour les QCM, un mode où l'on répond vraiment.

   Les pages d'origine restent là, en dessous : c'est la référence, et le seul
   recours quand le sujet porte un graphique que le texte ne dit pas.
   -------------------------------------------------------------------------- */

export function AnnalesList() {
  const data = useAnnales()

  if (!data) return <Chargement />
  if (data.epreuves.length === 0)
    return (
      <>
        <PageHead eyebrow="Annales" title="Aucune annale" />
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
          <Empty
            title="Rien dans ~/Documents/L1"
            hint="Les annales vivent hors du vault. Relance python3 scripts/annales.py après les avoir déposées."
          />
        </div>
      </>
    )

  const jouables = data.epreuves.filter((e) => e.qcm && e.qcm.sansReponse.length < e.qcm.nbQuestions)

  return (
    <>
      <PageHead
        eyebrow="Annales · Licence 1 Économie-Gestion"
        title="Les sujets tombés"
        desc="Les épreuves des années précédentes, reconstruites question par question : on peut les traiter au lieu de les regarder. Les pages scannées restent sous chaque sujet."
        right={
          jouables.length > 0 ? (
            <Link
              to={epreuveUrl(jouables[0]) + '/qcm'}
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
            >
              Passer un QCM
            </Link>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pb-24">
        <div className="flex flex-wrap gap-x-14 gap-y-6 pb-12 mb-14 border-b border-border">
          <Chiffre n={data.stats.matieres} l="matières" />
          <Chiffre n={data.stats.epreuves} l="épreuves" />
          <Chiffre n={data.stats.questions} l="questions" />
          <Chiffre n={data.stats.qcm} l="QCM jouables" />
        </div>

        <div className="space-y-16">
          {data.matieres.map((m) => {
            const epreuves = parMatiere(data, m.slug)
            return (
              <section key={m.slug}>
                <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
                  <h2 className="label uppercase tracking-wide">{m.nom}</h2>
                  <span className="caption text-subtle tabular-nums">{epreuves.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {epreuves.map((e) => (
                    <CarteEpreuve key={e.id} e={e} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}

function CarteEpreuve({ e }: { e: Epreuve }) {
  const n = nbQuestions(e)
  return (
    <Link
      to={epreuveUrl(e)}
      className="rounded-xl border border-border p-5 hover:border-brand/30 transition-colors flex flex-col"
    >
      <div className="caption uppercase text-subtle mb-3">{intitule(e)}</div>
      <div className="label mb-2.5">{e.titre}</div>

      <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
        {e.qcm && (
          <Etiquette teinte="#0e8ba8">
            QCM · {e.qcm.nbQuestions} question{e.qcm.nbQuestions > 1 ? 's' : ''}
          </Etiquette>
        )}
        {!e.qcm && n > 0 && <Etiquette>{n} questions</Etiquette>}
        <Etiquette>
          {e.nbPages} page{e.nbPages > 1 ? 's' : ''}
        </Etiquette>
        {e.corrige && <Etiquette teinte="#10b981">corrigé</Etiquette>}
      </div>
    </Link>
  )
}

function Etiquette({ children, teinte }: { children: React.ReactNode; teinte?: string }) {
  return (
    <span
      className="caption px-2 py-1 rounded-full bg-surface text-subtle"
      style={teinte ? { color: teinte } : undefined}
    >
      {children}
    </span>
  )
}

function Chiffre({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="display-md tabular-nums">{n}</div>
      <div className="caption uppercase text-subtle mt-2">{l}</div>
    </div>
  )
}

const Chargement = () => (
  <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24 caption text-subtle animate-pulse">
    Chargement des annales…
  </div>
)

/* ------------------------------------------------------------- une épreuve */

export function AnnaleView() {
  const data = useAnnales()
  const params = useParams()
  const id = `${params.matiere}/${params.slug}`
  const e = data?.epreuves.find((x) => x.id === id)

  if (!data) return <Chargement />
  if (!e)
    return (
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-24">
        <Empty title="Épreuve introuvable" hint={id} />
      </div>
    )

  const jumeau = data.epreuves.find((x) => x.id === (e.corrigePar ?? e.corrigeDe))
  const corrigeable = e.qcm && e.qcm.sansReponse.length < e.qcm.nbQuestions

  return (
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8 pt-12 pb-24">
      <div className="flex items-center justify-between gap-4 mb-10">
        <Link to="/annales" className="label text-subtle hover:text-foreground transition-colors">
          ← Annales
        </Link>
        {e.original && (
          <a
            href={e.original.url}
            target="_blank"
            rel="noreferrer"
            className="caption text-subtle hover:text-foreground transition-colors mono"
          >
            {e.original.ext.toUpperCase()} d’origine · {fmtOctets(e.original.octets)}
          </a>
        )}
      </div>

      <div className="caption uppercase text-subtle mb-5">
        {e.matiere} · {intitule(e)}
      </div>
      <h1 className="display-md max-w-4xl">{e.titre}</h1>

      {e.epreuve?.entete && (
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 caption text-subtle">
          {e.epreuve.entete.duree && <span>Durée : {e.epreuve.entete.duree}</span>}
          {e.epreuve.entete.documents && <span>Documents : {e.epreuve.entete.documents}</span>}
          {e.epreuve.entete.enseignant && <span>{e.epreuve.entete.enseignant}</span>}
        </div>
      )}

      {e.qcm && (
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          {corrigeable ? (
            <Link
              to={`${epreuveUrl(e)}/qcm`}
              className="label px-5 py-3 rounded-full bg-brand text-background hover:opacity-80 transition-opacity"
            >
              Passer le QCM ({e.qcm.nbQuestions} questions)
            </Link>
          ) : (
            <Link
              to={`${epreuveUrl(e)}/qcm`}
              className="label px-5 py-3 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
            >
              Lire les {e.qcm.nbQuestions} questions
            </Link>
          )}
          {e.qcm.retrouvees > 0 && (
            <span className="caption text-subtle">
              {e.qcm.retrouvees} réponse{e.qcm.retrouvees > 1 ? 's' : ''} reconstituée
              {e.qcm.retrouvees > 1 ? 's' : ''} d’après le cours — chacune cite sa source.
            </span>
          )}
          {e.qcm.sansReponse.length > 0 && (
            <span className="caption text-subtle">
              {e.qcm.sansReponse.length === e.qcm.nbQuestions
                ? 'Aucune réponse connue : le fichier ne porte pas de corrigé.'
                : `${e.qcm.sansReponse.length} question${e.qcm.sansReponse.length > 1 ? 's' : ''} sans corrigé (n° ${e.qcm.sansReponse.join(', ')}).`}
            </span>
          )}
        </div>
      )}

      {e.note && (
        <p className="mt-8 text-[14px] leading-relaxed text-muted max-w-3xl border-l-2 border-border pl-4">
          {e.note}
        </p>
      )}

      {jumeau && (
        <p className="mt-6 caption text-subtle">
          {e.corrigePar ? 'Corrigé :' : 'Sujet :'}{' '}
          <Link to={epreuveUrl(jumeau)} className="text-foreground hover:opacity-70">
            {jumeau.titre}
          </Link>
        </p>
      )}

      {e.epreuve?.entete?.consignes?.length ? (
        <details className="mt-10 max-w-3xl">
          <summary className="caption uppercase text-subtle cursor-pointer select-none">
            Consignes de l’épreuve
          </summary>
          <ul className="mt-4 space-y-2">
            {e.epreuve.entete.consignes.map((c, i) => (
              <li key={i} className="caption text-subtle leading-relaxed">
                — {c}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {e.epreuve?.parties?.length ? (
        <div className="mt-14 space-y-12 max-w-3xl">
          {e.epreuve.parties.map((p, i) => (
            <Partie key={i} p={p} />
          ))}
        </div>
      ) : null}

      <Pages e={e} />
    </div>
  )
}

function Partie({ p }: { p: PartieSujet }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
        <h2 className="label uppercase tracking-wide">{p.titre}</h2>
        {p.points !== null && <span className="caption text-subtle tabular-nums">{p.points} pts</span>}
      </div>

      {p.enonce.map((t, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-muted mb-4">
          <Maths>{t}</Maths>
        </p>
      ))}

      {p.tableaux?.map((t, i) => (
        <div key={i} className="my-6 overflow-x-auto">
          <table className="w-full text-[14px] border border-border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-surface">
                {t.colonnes.map((c, j) => (
                  <th key={j} className="text-left px-3 py-2 caption uppercase text-subtle font-normal">
                    <Maths>{c}</Maths>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.lignes.map((l, j) => (
                <tr key={j} className="border-t border-border">
                  {l.map((v, k) => (
                    <td key={k} className={`px-3 py-2 ${k === 0 ? '' : 'tabular-nums'}`}>
                      <Maths>{v}</Maths>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {p.questions.length > 0 && (
        <ol className="mt-5 space-y-4">
          {p.questions.map((q, i) => (
            <li key={i} className="flex gap-3">
              <span className="caption text-subtle mono shrink-0 pt-1 w-8">{q.ref}</span>
              <span className="text-[15px] leading-relaxed">
                <Maths>{q.texte}</Maths>
                {q.points !== null && (
                  <span className="caption text-subtle tabular-nums ml-2">({q.points} pts)</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Les pages d'origine : la référence, et le recours quand un graphique manque. */
function Pages({ e }: { e: Epreuve }) {
  const [ouverte, setOuverte] = useState<number | null>(null)

  if (e.pages.length === 0) return null

  return (
    <section className="mt-20">
      <div className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-border">
        <h2 className="label uppercase tracking-wide">Le sujet en images</h2>
        <span className="caption text-subtle tabular-nums">{e.pages.length}</span>
      </div>

      {ouverte === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {e.pages.map((p, i) => (
            <button
              key={p.nom}
              onClick={() => setOuverte(i)}
              className="group text-left"
              aria-label={`Ouvrir la page ${i + 1}`}
            >
              <div className="rounded-lg overflow-hidden border border-border group-hover:border-brand/30 transition-colors bg-surface">
                <img
                  src={p.mini}
                  alt={`Page ${i + 1}`}
                  loading="lazy"
                  width={p.w}
                  height={p.h}
                  className="w-full h-auto"
                />
              </div>
              <div className="caption text-subtle mt-2">Page {i + 1}</div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-4 mb-5">
            <button
              onClick={() => setOuverte(null)}
              className="caption text-subtle hover:text-foreground transition-colors"
            >
              ← Toutes les pages
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOuverte((i) => Math.max(0, (i ?? 0) - 1))}
                disabled={ouverte === 0}
                className="caption px-3 py-2 rounded-full bg-surface text-subtle disabled:opacity-30 hover:text-foreground transition-colors"
              >
                Précédente
              </button>
              <span className="caption text-subtle tabular-nums">
                {ouverte + 1} / {e.pages.length}
              </span>
              <button
                onClick={() => setOuverte((i) => Math.min(e.pages.length - 1, (i ?? 0) + 1))}
                disabled={ouverte === e.pages.length - 1}
                className="caption px-3 py-2 rounded-full bg-surface text-subtle disabled:opacity-30 hover:text-foreground transition-colors"
              >
                Suivante
              </button>
            </div>
          </div>
          <img
            src={e.pages[ouverte].url}
            alt={`Page ${ouverte + 1}`}
            width={e.pages[ouverte].w}
            height={e.pages[ouverte].h}
            className="w-full h-auto rounded-lg border border-border bg-surface"
          />
        </div>
      )}
    </section>
  )
}
