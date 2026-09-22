import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/* --------------------------------------------------------------------------
   Le bloc « Contrôle » d'une fiche, passé comme un QCM d'annales.

   L'indexeur le rend en `<details>` : la question en titre, les propositions
   « a) … b) … » dans un premier paragraphe, la réponse en gras suivie de son
   explication dans le second. Déplier pour lire la réponse ne dit pas si on la
   savait : ici on coche, on valide, et on voit ce qui est juste — le même geste
   que sur /annales/…/qcm.

   Le HTML arrive tout fait (`dangerouslySetInnerHTML`) : chaque bloc reconnu
   est remplacé par un point d'ancrage, et la question y est montée par portail.
   Un bloc qui ne suit pas ce format reste tel quel, repliable comme avant.
   -------------------------------------------------------------------------- */

type Controle = {
  hote: HTMLElement
  bloc: HTMLDetailsElement
  question: string
  options: { lettre: string; html: string }[]
  bonnes: string[]
  explication: string
}

const VERT = '#10b981'
const ROUGE = '#d92d5e'

function lire(bloc: HTMLDetailsElement): Omit<Controle, 'hote' | 'bloc'> | null {
  const titre = bloc.querySelector(':scope > summary')
  const ps = bloc.querySelectorAll(':scope > .callout-body > p')
  if (!titre || ps.length < 2) return null

  const options = ps[0].innerHTML
    .split('\n')
    .map((ligne) => ligne.match(/^\s*([a-e])\)\s*(.*)$/s))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ lettre: m[1], html: m[2] }))
  if (options.length < 2) return null

  const reponse = ps[1].querySelector(':scope > strong:first-child')
  const bonnes = [...new Set(reponse?.textContent?.match(/[a-e]/g) ?? [])]
  if (!bonnes.length || !bonnes.every((l) => options.some((o) => o.lettre === l))) return null

  // Sur une copie : le bloc d'origine doit rester intact pour être rendu.
  const suite = [...ps].slice(1).map((p) => p.cloneNode(true) as HTMLElement)
  suite[0].querySelector(':scope > strong:first-child')?.remove()
  const corps = suite.map((p) => p.innerHTML)
  corps[0] = corps[0].replace(/^\s*[—–-]\s*/, '')
  return { question: titre.innerHTML, options, bonnes, explication: corps.join('<br><br>') }
}

/** Repère les blocs Contrôle d'un corps de note et y monte les QCM. */
export function useControles(racine: HTMLElement | null, html: string | undefined) {
  const [controles, setControles] = useState<Controle[]>([])

  useLayoutEffect(() => {
    if (!racine || !html) return setControles([])
    const trouves: Controle[] = []
    for (const bloc of racine.querySelectorAll<HTMLDetailsElement>('details.callout--question')) {
      const lu = lire(bloc)
      if (!lu) continue
      const hote = document.createElement('div')
      hote.className = 'callout callout--question callout-test controle-qcm'
      bloc.replaceWith(hote)
      trouves.push({ hote, bloc, ...lu })
    }
    setControles(trouves)
    // Rendre les blocs d'origine : en mode strict l'effet repasse aussitôt, et
    // il doit retrouver les `<details>` pour remonter les questions.
    return () => {
      for (const c of trouves) c.hote.replaceWith(c.bloc)
    }
  }, [racine, html])

  return controles.map((c, i) => createPortal(<Question {...c} />, c.hote, `${html?.length}-${i}`))
}

function Question({ question, options, bonnes, explication }: Controle) {
  const [choix, setChoix] = useState<string[]>([])
  const [valide, setValide] = useState(false)
  const multiple = bonnes.length > 1
  const juste = bonnes.length === choix.length && bonnes.every((l) => choix.includes(l))

  const basculer = (lettre: string) => {
    if (valide) return
    setChoix((actuel) =>
      multiple
        ? actuel.includes(lettre)
          ? actuel.filter((l) => l !== lettre)
          : [...actuel, lettre]
        : [lettre]
    )
  }

  return (
    <>
      <p className="callout-title" dangerouslySetInnerHTML={{ __html: question }} />
      {multiple && <p className="caption text-subtle mt-1">plusieurs réponses attendues</p>}

      <div className="mt-4 space-y-2">
        {options.map((o) => {
          const choisi = choix.includes(o.lettre)
          const correcte = bonnes.includes(o.lettre)
          const teinte = valide ? (correcte ? VERT : choisi ? ROUGE : undefined) : undefined
          return (
            <button
              key={o.lettre}
              type="button"
              onClick={() => basculer(o.lettre)}
              disabled={valide}
              className={`w-full text-left flex gap-3 items-start px-4 py-3 rounded-xl border bg-background transition-colors ${
                choisi ? 'border-brand/50' : 'border-border hover:border-brand/30'
              }`}
              style={teinte ? { borderColor: teinte } : undefined}
            >
              <span
                className="caption mono uppercase shrink-0 pt-0.5"
                style={teinte ? { color: teinte } : undefined}
              >
                {o.lettre}
              </span>
              <span className="text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: o.html }} />
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {!valide ? (
          <button
            type="button"
            onClick={() => setValide(true)}
            disabled={!choix.length}
            className="label px-5 py-2.5 rounded-full bg-brand text-background hover:opacity-80 transition-opacity disabled:opacity-30"
          >
            Valider
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setChoix([])
              setValide(false)
            }}
            className="label px-5 py-2.5 rounded-full border border-border text-subtle hover:text-foreground hover:border-brand/30 transition-colors"
          >
            Refaire
          </button>
        )}
        {valide && (
          <span className="caption" style={{ color: juste ? VERT : ROUGE }}>
            {juste ? 'Juste.' : `Attendu : ${bonnes.join(', ')}`}
          </span>
        )}
      </div>

      {valide && (
        <p
          className="mt-5 text-[15px] leading-relaxed border-l-2 border-border pl-4"
          dangerouslySetInnerHTML={{ __html: explication }}
        />
      )}
    </>
  )
}
