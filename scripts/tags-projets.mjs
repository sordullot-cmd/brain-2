/**
 * Vocabulaire controle des tags de projet.
 *
 * Avant, `tags:` etait une liste libre tapee a la main dans chaque fiche, et
 * cinq natures d'information s'y melangeaient a plat : la structure
 * (`inspiration`, `univers`), la discipline (`ui`, `ux`), le domaine
 * (`finance`, `sante`), le style (`dark`, `playful`) et les partis pris de
 * design (`gamification`, `mascotte`). Resultat : deux boutons pour la meme
 * chose des qu'un accent manquait (`sante` / `sante`), des tags portes par tout
 * le monde qui ne triaient rien, des tags de workflow perso (`a-tester`) dans
 * un index public, un `#20` attrape dans le corps d'une fiche — et surtout des
 * absences, les sept journaux de trading du vault n'etant reperables que par
 * leur `dark`.
 *
 * Le systeme est maintenant a facettes. Chaque tag appartient a UNE facette et
 * a une seule, et chaque facette repond a une question differente :
 *
 *  - `domaine` — de quoi ca parle (1 par projet, deduit de `type_app`/`secteur`
 *    si la fiche ne le dit pas) ;
 *  - `sujet` — ce que le produit fait (0-3, a la main) ;
 *  - `procede` — le parti pris de design qu'on vient etudier ici (0-4, a la main) ;
 *  - `style` — a quoi ca ressemble (deduit de `mood:`, jamais ecrit a la main).
 *
 * Deux facettes sur quatre se deduisent donc du frontmatter structure : un
 * projet ne peut plus se retrouver sans domaine ni sans style, quel que soit le
 * soin apporte a sa ligne `tags:`. Tout ce qui n'est pas dans le vocabulaire
 * ci-dessous est ECARTE des tags de projet — ce qui rend l'oubli visible (le
 * tag disparait) plutot que silencieux (un doublon de plus dans la barre).
 *
 * Les tags de NOTE ne passent pas par ici : la page `/tags` continue de montrer
 * le vault tel qu'il est ecrit, `cours` et `cycle-3` compris.
 */

/** Les facettes, dans l'ordre d'affichage — du plus large au plus fin. */
export const FACETTES = [
  { cle: 'domaine', label: 'Domaine' },
  { cle: 'sujet', label: 'Sujet' },
  { cle: 'procede', label: 'Procédé' },
  { cle: 'style', label: 'Style' },
]

/** tag -> facette. C'est la liste complete : hors de ce tableau, pas de tag. */
export const VOCABULAIRE = new Map(
  Object.entries({
    // ------------------------------------------------------------ domaine
    finance: 'domaine',
    santé: 'domaine',
    productivité: 'domaine',
    éducation: 'domaine',
    social: 'domaine',
    média: 'domaine',
    commerce: 'domaine',
    jeu: 'domaine',
    outil: 'domaine',
    tech: 'domaine',

    // -------------------------------------------------------------- sujet
    trading: 'sujet',
    journal: 'sujet',
    playbook: 'sujet',
    crypto: 'sujet',
    banque: 'sujet',
    budget: 'sujet',
    habitudes: 'sujet',
    nutrition: 'sujet',
    méditation: 'sujet',
    émotions: 'sujet',
    langues: 'sujet',
    agenda: 'sujet',
    temps: 'sujet',
    apprentissage: 'sujet',
    ia: 'sujet',

    // ------------------------------------------------------------ procédé
    gamification: 'procede',
    mascotte: 'procede',
    illustration: 'procede',
    isométrique: 'procede',
    '3d': 'procede',
    motion: 'procede',
    'data-viz': 'procede',
    'design-system': 'procede',
    'typo-maison': 'procede',
    refonte: 'procede',
    onboarding: 'procede',
    paywall: 'procede',

    // -------------------------------------------------------------- style
    minimal: 'style',
    bold: 'style',
    dark: 'style',
    playful: 'style',
    editorial: 'style',
    organic: 'style',
    brutalist: 'style',
    retro: 'style',
    luxe: 'style',
  })
)

/**
 * Alias -> forme canonique. Surtout des accents perdus a la frappe : c'est ce
 * qui donnait deux boutons `sante` et `sante` dans la barre de filtres, chacun
 * ne montrant qu'une moitie des projets de sante.
 */
const SYNONYMES = new Map(
  Object.entries({
    sante: 'santé',
    productivite: 'productivité',
    education: 'éducation',
    meditation: 'méditation',
    emotions: 'émotions',
    isometrique: 'isométrique',
    media: 'média',
    dataviz: 'data-viz',
    'design system': 'design-system',
    designsystem: 'design-system',
    food: 'nutrition',
    sport: 'santé',
    fitness: 'santé',
  })
)

/**
 * `type_app` (produits) et `secteur` (univers) parlent deja le vocabulaire des
 * domaines, a l'accent et au synonyme pres — d'ou cette table plutot qu'une
 * confiance aveugle dans le champ.
 */
const DOMAINE_PAR_SECTEUR = new Map(
  Object.entries({
    finance: 'finance',
    fintech: 'finance',
    santé: 'santé',
    'bien-être': 'santé',
    productivité: 'productivité',
    éducation: 'éducation',
    gaming: 'jeu',
    jeu: 'jeu',
    'jeu-vidéo': 'jeu',
    social: 'social',
    média: 'média',
    musique: 'média',
    culture: 'média',
    commerce: 'commerce',
    mode: 'commerce',
    luxe: 'commerce',
    outil: 'outil',
    ia: 'outil',
    tech: 'tech',
    web3: 'tech',
  })
)

const canonique = (t) => {
  const brut = String(t).replace(/^#/, '').trim().toLowerCase()
  if (!brut) return null
  const nom = SYNONYMES.get(brut) ?? brut
  return VOCABULAIRE.has(nom) ? nom : null
}

/** Range une liste de tags par facette, en jetant le hors-vocabulaire. */
function parFacette(tags) {
  const out = Object.fromEntries(FACETTES.map((f) => [f.cle, []]))
  for (const t of tags) {
    const nom = canonique(t)
    if (!nom) continue
    const facette = VOCABULAIRE.get(nom)
    if (!out[facette].includes(nom)) out[facette].push(nom)
  }
  return out
}

/**
 * Les tags d'un projet : ce que la fiche ecrit, plus ce que son frontmatter
 * structure dit deja.
 *
 * Les deux completions ne s'ajoutent que si la facette est vide — une fiche qui
 * corrige son domaine a la main garde le sien (l'univers Duolingo est classe
 * `secteur: tech` mais c'est de l'education qu'on vient y chercher).
 */
export function tagsProjet(fm, tagsEcrits = []) {
  const facettes = parFacette(tagsEcrits)

  if (!facettes.domaine.length) {
    // Les trois champs sont essayes dans l'ordre plutot qu'en `||` : un univers
    // porte `categorie: app`, qui existe mais ne designe aucun domaine, et
    // faisait tomber `secteur:` sous la table.
    for (const source of [fm.type_app, fm.categorie, fm.secteur]) {
      if (!source) continue
      const d = DOMAINE_PAR_SECTEUR.get(String(source).trim().toLowerCase()) ?? canonique(source)
      if (d && VOCABULAIRE.get(d) === 'domaine') {
        facettes.domaine.push(d)
        break
      }
    }
  }

  if (!facettes.style.length) {
    const mood = Array.isArray(fm.mood) ? fm.mood : typeof fm.mood === 'string' ? fm.mood.split(/[,\s]+/) : []
    for (const m of mood) {
      const s = canonique(m)
      if (s && VOCABULAIRE.get(s) === 'style' && !facettes.style.includes(s)) facettes.style.push(s)
    }
  }

  // La liste plate garde l'ordre des facettes : un tag lu isolement (vignette,
  // URL de filtre) reste range du plus large au plus fin.
  const tags = FACETTES.flatMap((f) => facettes[f.cle])
  return { tags, facettes }
}

/**
 * Les 2-3 tags de la vignette. On descend les facettes dans l'ordre en prenant
 * le premier de chacune : le classement par rarete d'avant faisait remonter
 * l'accident (un tag unique parce que mal orthographie) au lieu du caractere.
 * Le sujet passe devant le domaine — savoir qu'un projet parle de `trading` en
 * dit plus que de savoir qu'il parle de `finance`, que douze autres partagent.
 */
export function tagsVignette({ sujet, procede, domaine, style }) {
  const choix = [sujet[0], procede[0], sujet[1] ?? domaine[0], procede[1] ?? style[0]]
  return [...new Set(choix.filter(Boolean))].slice(0, 3)
}
