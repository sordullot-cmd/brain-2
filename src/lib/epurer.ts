import { norm } from './vault'

/* --------------------------------------------------------------------------
   Une fiche de cours, réduite au cours.

   La fiche du vault sert deux maîtres : le cours, et tout ce qui sert à le
   tenir à jour dans Obsidian — d'où vient chaque paragraphe (➕, 🎞️), ce qu'il
   reste à récupérer, les cartes Anki en vrac, le QCM, le protocole de révision,
   le format de l'épreuve, les heures de CM. Demande de Sacha (9 octobre 2026) :
   sur le site, « je veux juste mon cours ».

   On ne touche pas au markdown — c'est la source des cartes et du QCM, et le
   skill /eco s'appuie sur ces blocs. On élague le HTML rendu, à l'affichage.
   -------------------------------------------------------------------------- */

/** Sections qui ne sont pas du cours : on retire le titre et tout ce qui suit jusqu'au titre suivant. */
const SECTION_HORS_COURS =
  /(cartes? a creer|comment reviser|^controle|a verifier|a recuperer|ce que j.ai complete|bibliographie|ou tu en es|son examen|son evaluation)/

/** Callouts de suivi : provenance, trous, consignes de révision. */
const CALLOUT_HORS_COURS =
  /(seance|manque|camarade|a verifier|a recuperer|cours de reference|ce qui est du cours|s.arrete|ont corrige|ce que tu as note|pourquoi ces cartes|evalue|examen|provenance|syllabus)/

/**
 * Une phrase qui dit d'où vient le texte, pas ce que dit le cours : « absentes
 * de tes notes », « le second camarade ajoute », « que la slide ne donne pas ».
 */
const PHRASE_PROVENANCE =
  /(tes (propres )?notes|ta note|ta photo|ton titre|tu l.as note|camarade|programme de l.ue|bloc de tracabilite|la slide ne|que la slide|recopiee? par|a confronter au cours|a confirmer aupres)/

/** Les marqueurs de provenance posés en tête de ligne par /eco. */
const MARQUEURS = /[➕🎞✍👥]\uFE0F?\s*/gu

const estTitre = (el: Element | null) => !!el && /^H[12]$/.test(el.tagName)

/** Le texte d'un titre, sans l'emoji de tête : « ✅ Contrôle » → « controle ». */
const titreNu = (el: Element) => norm(el.textContent ?? '').replace(/^[^a-z0-9]+/, '').trim()

const sansBalises = (h: string) => norm(h.replace(/<[^>]+>/g, ''))
const deProvenance = (h: string) => PHRASE_PROVENANCE.test(sansBalises(h))

/** Majuscule à la première lettre du texte, pas d'une balise. */
const capitale = (h: string) => h.replace(/^((?:<[^>]+>|\s|[«(])*)(\p{Ll})/u, (_, a, l) => a + l.toUpperCase())

/** Les incises de provenance qu'on peut ôter sans toucher au reste de la phrase. */
const INCISES: RegExp[] = [
  /,?\s*tel(?:le)?s? que tu l['’]as not[ée]e?s?/giu,
  /,?\s*que (?:la slide|les slides|tes notes|ta note) ne \S+(?: pas)?/giu,
  /,\s*recopi[ée]e?s? par (?:un|une|des|tes|deux) camarades?,/giu,
  /^(?:(?:<[^>]+>)*\s*)(?:(?:le|la|les|tes|un|deux) )?(?:second |premier |deux )?camarades? (?:note|notent|ajoute|ajoutent|pr[ée]cise|pr[ée]cisent)n?t? que\s+/iu,
]

/**
 * Une phrase qui mêle cours et provenance garde son cours : « celle de Lionel
 * Robbins (1932) — un nom qui tombe en QCM ; tes notes ne le mentionnent pas »
 * perd sa dernière proposition, pas Robbins. Elle ne part entière que si rien
 * n'y relève du cours.
 */
function nettoyerPhrase(ph: string): string {
  if (!deProvenance(ph)) return ph
  let p = ph
  for (const re of INCISES) p = p.replace(re, '')
  p = capitale(p)
  if (!deProvenance(p)) return p

  // Les propositions séparées par un tiret ou un point-virgule.
  const fin = /[.!?…]\s*$/.exec(p)?.[0] ?? ''
  const corps = fin ? p.slice(0, -fin.length) : p
  const morceaux = corps.split(/\s+(?:—|;)\s+/)
  if (morceaux.length > 1) {
    const gardes = morceaux.filter((m) => !deProvenance(m))
    if (gardes.length > 0 && !deProvenance(morceaux[0])) return gardes.join(' — ') + (fin.trim() || '.')
  }

  // « X : Y » — on garde la moitié qui est du cours.
  const deux = /^(.*?)\s:\s(.+)$/su.exec(p)
  if (deux) {
    const [, tete, queue] = deux
    if (!deProvenance(tete) && deProvenance(queue)) return tete + '.'
    if (deProvenance(tete) && !deProvenance(queue) && sansBalises(queue).length > 40) return capitale(queue)
  }
  return ''
}

/**
 * Retire d'un paragraphe les phrases de provenance. On coupe le HTML aux fins
 * de phrase : le gras et l'italique tiennent presque toujours dans une phrase,
 * et quand une balise déborde, le navigateur la referme en relisant le HTML.
 */
function sansProvenance(bloc: Element) {
  if (!deProvenance(bloc.textContent ?? '')) return
  const phrases = bloc.innerHTML.split(/(?<=[.!?…])\s+(?=[<«(A-ZÀ-Ý*]|<)/u)
  bloc.innerHTML = phrases.map(nettoyerPhrase).filter((ph) => ph.trim()).join(' ')
  if (!bloc.textContent?.trim() && !bloc.querySelector('img, svg, table')) bloc.remove()
}

export function epurerCours(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="racine">${html}</div>`, 'text/html')
  const racine = doc.getElementById('racine')!

  // 1. Avant la première partie : le titre et « L'essentiel », rien d'autre —
  //    pas la ligne UE · période · format d'épreuve, ni les liens de navigation.
  for (const el of [...racine.children]) {
    if (el.tagName === 'H2') break
    if (el.tagName === 'H1') continue
    if (el.classList.contains('callout--abstract')) continue
    el.remove()
  }

  // 2. Les sections de suivi, entières.
  for (const h of [...racine.querySelectorAll(':scope > h2')]) {
    if (!SECTION_HORS_COURS.test(titreNu(h))) continue
    let el: Element | null = h
    while (el) {
      const suivant: Element | null = el.nextElementSibling
      el.remove()
      el = suivant && !estTitre(suivant) ? suivant : null
    }
  }

  // 3. Les encadrés de suivi, où qu'ils soient.
  for (const c of [...racine.querySelectorAll('.callout')]) {
    if (c.classList.contains('callout--abstract') || c.classList.contains('callout--quote')) continue
    const titre = c.querySelector(':scope > .callout-title')?.textContent ?? ''
    if (CALLOUT_HORS_COURS.test(norm(titre))) c.remove()
  }

  // 4. Les marqueurs de provenance dans le texte, puis les phrases qui disent d'où il vient.
  const parcours = doc.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    if (!MARQUEURS.test(n.textContent ?? '')) continue
    MARQUEURS.lastIndex = 0
    n.textContent = (n.textContent ?? '').replace(MARQUEURS, '')
  }
  MARQUEURS.lastIndex = 0
  // Une légende posée juste sous un visuel arrive en texte nu, astérisques
  // compris (le markdown ne la lit pas après une image) : on en refait un
  // paragraphe, pour qu'elle se lise — et se filtre — comme les autres.
  for (const n of [...racine.childNodes]) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue
    const p = doc.createElement('p')
    p.innerHTML = n.textContent
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    n.replaceWith(p)
  }
  for (const bloc of [...racine.querySelectorAll('p, li, td')]) sansProvenance(bloc)

  // 5. Les filets qui ne séparent plus rien.
  for (const hr of [...racine.querySelectorAll(':scope > hr')]) {
    const avant = hr.previousElementSibling
    const apres = hr.nextElementSibling
    if (!apres || apres.tagName === 'HR' || !avant || avant.tagName === 'H1') hr.remove()
  }

  return racine.innerHTML
}
