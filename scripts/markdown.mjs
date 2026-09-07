/**
 * Rendu markdown « à la Obsidian » pour les notes du vault.
 *
 * `marked` seul rend du GFM : les fiches de cours d'eco gestion sont alors
 * illisibles sur le site, parce que tout leur appareil de revision repose sur
 * des choses que marked ne connait pas :
 *
 *   - les CALLOUTS (`> [!question]- …`) — affiches en blockquote avec le
 *     `[!question]-` en clair, alors que c'est le mecanisme meme du bloc
 *     Controle : question visible, reponse repliee ;
 *   - les MATHS (`$x$`, `$$…$$`) — affichees en texte brut, donc les fiches de
 *     maths (derivees, indices, tableaux de signes) ne se relisent pas ;
 *   - les ANCRES INTERNES (`[[#titre]]`) — perdues purement et simplement,
 *     alors que chaque question de Controle pointe vers la section qui repond.
 *
 * Tout est rendu ICI, a l'indexation : le site ne charge aucun JS de rendu, il
 * recoit du HTML fini. Cote client il ne reste que le CSS (celui de KaTeX et
 * `.callout` dans index.css).
 */
import { marked } from 'marked'
import katex from 'katex'

/** Slug d'ancre, aligne sur ce que fait Obsidian : le texte du titre. */
export function slug(texte) {
  return String(texte)
    .replace(/[*_`~]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Titre par defaut d'un callout, quand la ligne `[!type]` n'en donne pas. */
const LIBELLES = {
  abstract: 'Résumé', summary: 'Résumé', tldr: 'Résumé',
  note: 'Note', info: 'Info', todo: 'À faire',
  tip: 'Astuce', hint: 'Astuce', important: 'Important',
  success: 'Réussi', check: 'Réussi', done: 'Réussi',
  question: 'Question', help: 'Aide', faq: 'Question',
  warning: 'Attention', caution: 'Attention', attention: 'Attention',
  failure: 'Échec', fail: 'Échec', missing: 'Manquant',
  danger: 'Danger', error: 'Erreur', bug: 'Bug',
  example: 'Exemple', quote: 'Citation', cite: 'Citation',
}

/**
 * Familles de couleur. Un callout doit se reconnaitre sans lire son titre :
 * ce qui alerte est chaud, ce qui resume est neutre, ce qui se teste est
 * accentue. Les valeurs vivent dans index.css, ici on ne pose que la classe.
 */
const FAMILLE = {
  danger: 'alerte', error: 'alerte', bug: 'alerte', failure: 'alerte',
  fail: 'alerte', missing: 'alerte',
  warning: 'prudence', caution: 'prudence', attention: 'prudence',
  question: 'test', help: 'test', faq: 'test',
  abstract: 'resume', summary: 'resume', tldr: 'resume',
  tip: 'astuce', hint: 'astuce', important: 'astuce',
  success: 'reussi', check: 'reussi', done: 'reussi',
  example: 'exemple', quote: 'citation', cite: 'citation',
}

const echappe = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const BRUIT_KATEX = /No character metrics/
const warnOrigine = console.warn
console.warn = (...a) => {
  if (BRUIT_KATEX.test(String(a[0] ?? ''))) return
  warnOrigine(...a)
}

const rendMaths = (tex, bloc) => {
  try {
    return katex.renderToString(tex, { displayMode: bloc, throwOnError: false, strict: false })
  } catch {
    // formule invalide : on rend le source, jamais une page cassee
    return `<code class="math-brute">${echappe(bloc ? `$$${tex}$$` : `$${tex}$`)}</code>`
  }
}

/**
 * Callout Obsidian : un blockquote dont la premiere ligne est `[!type]`.
 *
 * Rendu en `<details>` quand il est repliable (`-` ferme, `+` ouvert), ce qui
 * donne le comportement du bloc Controle sans une ligne de JavaScript : la
 * question est le `<summary>`, la reponse est dedans.
 */
const extensionCallout = {
  name: 'callout',
  level: 'block',
  start(src) {
    const m = /^ {0,3}> *\[!/m.exec(src)
    return m ? m.index : undefined
  },
  tokenizer(src) {
    const m = /^(?: {0,3}>.*(?:\n|$))+/.exec(src)
    if (!m) return
    const lignes = m[0].replace(/\n$/, '').split('\n')
    const tete = /^ {0,3}> *\[!([a-zA-Z]+)\]([-+]?) *(.*)$/.exec(lignes[0])
    if (!tete) return
    const corps = lignes.slice(1).map((l) => l.replace(/^ {0,3}> ?/, '')).join('\n')
    const type = tete[1].toLowerCase()
    return {
      type: 'callout',
      raw: m[0],
      kind: type,
      pli: tete[2],
      titre: tete[3].trim(),
      titreTokens: this.lexer.inlineTokens(tete[3].trim()),
      tokens: this.lexer.blockTokens(corps, []),
    }
  },
  renderer(token) {
    const corps = this.parser.parse(token.tokens)
    const titre =
      (token.titre ? this.parser.parseInline(token.titreTokens) : '') ||
      LIBELLES[token.kind] ||
      token.kind
    const classes = `callout callout--${echappe(token.kind)} callout-${FAMILLE[token.kind] || 'neutre'}`
    if (token.pli === '-' || token.pli === '+') {
      const ouvert = token.pli === '+' ? ' open' : ''
      return `<details class="${classes} callout--pliable"${ouvert}><summary class="callout-title">${titre}</summary><div class="callout-body">${corps}</div></details>\n`
    }
    return `<div class="${classes}"><p class="callout-title">${titre}</p><div class="callout-body">${corps}</div></div>\n`
  },
}

/** `$$…$$` en bloc centre. */
const extensionMathsBloc = {
  name: 'mathsBloc',
  level: 'block',
  start(src) {
    const m = /\$\$/.exec(src)
    return m ? m.index : undefined
  },
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src)
    if (!m) return
    return { type: 'mathsBloc', raw: m[0], tex: m[1].trim() }
  },
  renderer(token) {
    return `<div class="math-bloc">${rendMaths(token.tex, true)}</div>\n`
  },
}

/**
 * `$…$` dans le texte.
 *
 * Les garde-fous evitent de prendre un prix pour une formule : pas d'espace
 * collee aux delimiteurs, et un contenu qui ne peut pas contenir de `$`.
 * `20 $ de plus` reste donc du texte, `$(uv)'$` devient une formule.
 */
const extensionMathsLigne = {
  name: 'mathsLigne',
  level: 'inline',
  start(src) {
    const m = /\$[^\s$]/.exec(src)
    return m ? m.index : undefined
  },
  tokenizer(src) {
    const m = /^\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/.exec(src)
    if (!m) return
    return { type: 'mathsLigne', raw: m[0], tex: m[1] }
  },
  renderer(token) {
    return rendMaths(token.tex, false)
  },
}

/**
 * Un `id` sur chaque titre, pour que les ancres internes tombent au bon
 * endroit. Meme fonction `slug()` des deux cotes, sinon les liens du bloc
 * Controle pointeraient dans le vide.
 */
const rendTitres = {
  heading(token) {
    const texte = this.parser.parseInline(token.tokens)
    // `token.text` est le titre tel qu'ecrit dans le markdown. Le HTML rendu ne
    // convient pas : `parseInline` y echappe l'apostrophe en `&#39;`, et le slug
    // devenait `d-39-organisations` — une ancre sur trois tombait dans le vide.
    const brut = token.text || texte.replace(/<[^>]*>/g, '')
    return `<h${token.depth} id="${slug(brut)}">${texte}</h${token.depth}>\n`
  },
}

let pret = false

/** À appeler une fois avant tout `marked.parse`. */
export function configureMarked() {
  if (pret) return marked
  marked.setOptions({ gfm: true, breaks: false })
  marked.use({
    extensions: [extensionCallout, extensionMathsBloc, extensionMathsLigne],
    renderer: rendTitres,
  })
  pret = true
  return marked
}
