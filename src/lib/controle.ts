import type { Question } from './annales'

/* --------------------------------------------------------------------------
   Les blocs « Contrôle » d'une fiche, relus comme un QCM d'annales.

   L'indexeur les rend en `<details>` : la question en titre, les propositions
   « a) … b) … » dans un premier paragraphe, la réponse en gras suivie de son
   explication dans le second. On en tire des `Question`, jouées par le même
   écran que les QCM des annales ; le thème de chaque question est la partie
   (H2) de la fiche où elle se trouve.

   Un bloc qui ne suit pas ce format est laissé de côté plutôt que deviné.
   -------------------------------------------------------------------------- */

function lire(bloc: Element, n: number, theme: string | null, base: string): Question | null {
  const titre = bloc.querySelector(':scope > summary')
  const ps = [...bloc.querySelectorAll(':scope > .callout-body > p')] as HTMLElement[]
  if (!titre || ps.length < 2) return null

  const propositions = ps[0].innerHTML
    .split('\n')
    .map((ligne) => ligne.match(/^\s*([a-e])\)\s*(.*)$/s))
    .filter((m): m is RegExpMatchArray => !!m)
  if (propositions.length < 2) return null

  const reponse = ps[1].querySelector(':scope > strong:first-child')
  // Lettres isolées seulement : « a, b et d » ne doit pas lire le « e » de « et ».
  const bonnes = new Set(reponse?.textContent?.match(/\b[a-e]\b/g) ?? [])
  if (!bonnes.size || ![...bonnes].every((l) => propositions.some((m) => m[1] === l))) return null
  reponse!.remove()

  // Les renvois « → la section qui répond » pointent vers une ancre de la
  // fiche : depuis le QCM, ils doivent ramener sur la fiche elle-même.
  // `data-internal` : la page les suit dans la SPA, sans recharger.
  for (const a of ps[1].querySelectorAll('a[href^="#"]')) {
    a.setAttribute('href', base + a.getAttribute('href'))
    a.setAttribute('data-internal', '1')
  }
  const explication = ps
    .slice(1)
    .map((p) => p.innerHTML)
    .join('<br><br>')
    .replace(/^\s*[—–-]\s*/, '')

  return {
    n,
    numero: n + 1,
    theme,
    enonce: titre.innerHTML,
    options: propositions.map((m) => ({ lettre: m[1], texte: m[2], correcte: bonnes.has(m[1]) })),
    multiple: bonnes.size > 1,
    explication,
  }
}

/** Les questions de contrôle d'une fiche, dans l'ordre du texte. */
export function qcmDeFiche(html: string, base: string): Question[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: Question[] = []
  let theme: string | null = null
  for (const el of doc.querySelectorAll('h2, details.callout--question')) {
    if (el.tagName === 'H2') theme = (el.textContent ?? '').trim() || null
    else {
      const q = lire(el, out.length, theme, base)
      if (q) out.push(q)
    }
  }
  return out
}
