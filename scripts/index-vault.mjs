#!/usr/bin/env node
/**
 * Indexeur du vault Obsidian -> public/vault.json + public/media/
 *
 * Lit le vault, parse le frontmatter et le markdown de chaque note, resout les
 * [[wikilinks]] et les ![[embeds]] a la maniere d'Obsidian (par nom de fichier),
 * calcule les backlinks, copie les medias, et ecrit un index JSON unique que le
 * site consomme. Relance a chaque `npm run dev` / `npm run build`.
 *
 * Chemin du vault : variable d'env VAULT_PATH, sinon la valeur par defaut ci-dessous.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { marked } from 'marked'
import { imageSize } from './image-size.mjs'
import { buildDerivatives, SIZES } from './derivatives.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const VAULT = process.env.VAULT_PATH || path.join(os.homedir(), 'Documents', 'brain^2')
const OUT_DIR = path.join(ROOT, 'public')
const MEDIA_DIR = path.join(OUT_DIR, 'media')
const OUT_JSON = path.join(OUT_DIR, 'vault.json')
// Le HTML des notes et leur texte de recherche pesaient 60 % du JSON charge au
// premier ecran, pour deux pages qui en ont besoin. Ils partent dans un second
// fichier, recupere en tache de fond (voir src/lib/vault.ts).
const OUT_TEXT = path.join(OUT_DIR, 'vault-notes.json')

const SKIP_DIRS = new Set(['.git', '.obsidian', '.claude', '.trash', 'node_modules', '__pycache__'])

/**
 * `planches/` = planches de vignettes generees pour la lecture dans Obsidian
 * (une image par famille de visuels). Elles restent indexees, sinon les embeds
 * de la fiche ne se resolvent pas — mais elles sont ECARTEES des galeries par
 * aspect : le site compose lui-meme les visuels d'origine, une planche y ferait
 * doublon avec les fichiers qu'elle montre.
 */
const isPlanche = (folder) => folder.split('/').includes('planches')
const SKIP_FILES = new Set(['.DS_Store', '.gitattributes'])

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg'])
const DOC_EXT = new Set(['.pdf'])

/** Notes de documentation technique : indexees mais rangees a part. */
const META_NOTES = new Set(['CLAUDE.md', 'CONTEXTE-POUR-CLAUDE.md'])

// ---------------------------------------------------------------- utilitaires

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const kindOf = (ext) => {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (DOC_EXT.has(ext)) return 'doc'
  return 'other'
}

/** URL publique d'un media, chaque segment encode (accents, espaces, ^). */
const mediaUrl = (rel) => '/media/' + rel.split(path.sep).map(encodeURIComponent).join('/')

/** Titre lisible : le H1 du markdown, sinon le nom de fichier. */
const titleOf = (body, file) => {
  const h1 = body.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].replace(/[*_`]/g, '').trim()
  return path.basename(file, '.md')
}

// ------------------------------------------------------------------ collecte

function walk(dir, acc = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (e.name.startsWith('._')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      acc.push({ dir: true, full })
      walk(full, acc)
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue
      acc.push({ dir: false, full })
    }
  }
  return acc
}

if (!fs.existsSync(VAULT)) {
  console.error(`\n  Vault introuvable : ${VAULT}`)
  console.error(`  Definis le bon chemin :  VAULT_PATH="/chemin/vers/le/vault" npm run dev\n`)
  process.exit(1)
}

const entries = walk(VAULT)
const mdFiles = entries.filter((e) => !e.dir && e.full.endsWith('.md')).map((e) => e.full)
const mediaFiles = entries
  .filter((e) => !e.dir && !e.full.endsWith('.md'))
  .map((e) => e.full)
  .filter((f) => kindOf(path.extname(f).toLowerCase()) !== 'other')

// -------------------------------------------------------------- medias (copie)

// Copie INCREMENTALE. On effacait tout puis on recopiait 600 Mo a chaque
// indexation : lent, et `rmSync` echouait en ENOTEMPTY des que le serveur de dev
// lisait dans le dossier au meme moment. On ne copie donc que ce qui a change,
// et on supprime les orphelins a la fin.
fs.mkdirSync(MEDIA_DIR, { recursive: true })
let copies = 0

const media = []
/** basename (avec et sans extension, NFC) -> media, pour resoudre les embeds. */
const mediaByName = new Map()

for (const full of mediaFiles) {
  const rel = path.relative(VAULT, full)
  const dest = path.join(MEDIA_DIR, rel)
  const stat = fs.statSync(full)
  let cur = null
  try {
    cur = fs.statSync(dest)
  } catch {
    /* pas encore copie */
  }
  if (!cur || cur.size !== stat.size || cur.mtimeMs < stat.mtimeMs) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(full, dest)
    copies++
  }

  const ext = path.extname(full).toLowerCase()
  const name = path.basename(full)
  // Dimensions : la mise en page du site compose les visuels selon leur format.
  const dim = kindOf(ext) === 'image' ? imageSize(full, ext) : null
  const item = {
    id: rel.split(path.sep).join('/'),
    path: rel.split(path.sep).join('/'),
    url: mediaUrl(rel),
    name,
    stem: path.basename(full, ext),
    ext: ext.slice(1),
    kind: kindOf(ext),
    folder: path.dirname(rel).split(path.sep).join('/'),
    size: stat.size,
    mtime: stat.mtimeMs,
    ...(dim ? { w: dim.w, h: dim.h } : {}),
  }
  // Non serialise : sert seulement a produire les derives (voir plus bas).
  Object.defineProperty(item, 'absPath', { value: full, enumerable: false })
  media.push(item)
  for (const key of [name, item.stem]) {
    const k = key.normalize('NFC')
    if (!mediaByName.has(k)) mediaByName.set(k, item)
  }
}

// Ce qui n'est plus dans le vault n'a plus a etre servi.
const gardes = new Set(media.map((m) => path.join(MEDIA_DIR, m.path.split('/').join(path.sep))))
let orphelins = 0
;(function purge(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      purge(full)
      try {
        if (!fs.readdirSync(full).length) fs.rmdirSync(full)
      } catch {
        /* dossier non vide entre-temps */
      }
    } else if (!gardes.has(full)) {
      fs.rmSync(full, { force: true })
      orphelins++
    }
  }
})(MEDIA_DIR)

// ------------------------------------------------------------ derives (web)

// Les grilles et la visionneuse consomment des WebP redimensionnes, pas les
// originaux : sans ca la page charge des centaines de Mo et l'onglet se bloque.
const deriv = await buildDerivatives({ outDir: OUT_DIR, items: media, log: (m) => console.log(m) })

// --------------------------------------------------------------- notes (parse)

const notes = []
const noteByName = new Map()

for (const full of mdFiles) {
  const rel = path.relative(VAULT, full).split(path.sep).join('/')
  const raw = fs.readFileSync(full, 'utf8')
  let fm = {}
  let body = raw
  try {
    const parsed = matter(raw)
    fm = parsed.data || {}
    body = parsed.content
  } catch {
    // frontmatter casse : on garde le corps brut plutot que de perdre la note
  }
  const stat = fs.statSync(full)
  const base = path.basename(full)
  const note = {
    id: rel,
    path: rel,
    slug: slugify(rel.replace(/\.md$/, '')),
    name: base,
    stem: path.basename(full, '.md'),
    title: fm.title || titleOf(body, full),
    folder: path.dirname(rel) === '.' ? '' : path.dirname(rel),
    domain: rel.includes('/') ? rel.split('/')[0] : '(racine)',
    isIndex: base.startsWith('_') || /^(ACCUEIL|00 Dashboard)\.md$/.test(base),
    isMeta: META_NOTES.has(base) || rel.startsWith('TEMPLATES/'),
    frontmatter: fm,
    type: fm.type || null,
    body,
    mtime: stat.mtimeMs,
    size: stat.size,
    tags: [],
    links: [],
    backlinks: [],
    media: [],
  }
  notes.push(note)
  for (const key of [base, note.stem]) {
    const k = key.normalize('NFC')
    if (!noteByName.has(k)) noteByName.set(k, note)
  }
}

// ------------------------------------------------------------------- tags

const tagCounts = new Map()

const addTag = (note, tag) => {
  const t = String(tag).replace(/^#/, '').trim()
  if (!t) return
  if (!note.tags.includes(t)) note.tags.push(t)
  tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
}

for (const note of notes) {
  const fmTags = note.frontmatter.tags
  if (Array.isArray(fmTags)) fmTags.forEach((t) => addTag(note, t))
  else if (typeof fmTags === 'string') fmTags.split(/[,\s]+/).forEach((t) => addTag(note, t))

  // tags inline #xxx, hors blocs de code et hors couleurs hexadecimales
  const noCode = note.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  for (const m of noCode.matchAll(/(^|[\s(])#([\p{L}\p{N}/_-]{2,})/gu)) {
    if (/^[0-9a-fA-F]{3,8}$/.test(m[2])) continue
    addTag(note, m[2])
  }
}

// ------------------------------------------- liens, embeds, rendu du markdown

const WIKILINK = /(!?)\[\[([^\]]+?)\]\]/g

/** Remplace wikilinks et embeds par du HTML resolu, et collecte les relations. */
function resolveLinks(note) {
  return note.body.replace(WIKILINK, (full, bang, inner) => {
    const [targetRaw, aliasRaw] = inner.split('|')
    const target = (targetRaw || '').split('#')[0].trim().replace(/\\$/, '')
    const alias = (aliasRaw || '').trim()
    if (!target) return alias || ''

    const key = target.split('/').pop().normalize('NFC')
    const m = mediaByName.get(key)
    const n = noteByName.get(key) || noteByName.get(key + '.md')

    if (bang === '!' && m) {
      if (!note.media.includes(m.id)) note.media.push(m.id)
      if (m.kind === 'video') {
        // `preload="none"` : une note peut embarquer dix videos de 20 Mo, on ne
        // telecharge que celles qu'on lance. L'affiche vient du derive.
        const poster = m.thumb ? ` poster="${m.thumb}"` : ''
        // `m.preview` : le master du vault fait jusqu'a 21 Mo, le derive ~1 Mo.
        return `<video src="${m.preview || m.url}"${poster} controls loop muted playsinline preload="none" class="vault-embed"></video>`
      }
      // Le corps d'une note fait ~700 px de large : le derive suffit largement,
      // et l'original (jusqu'a 11 Mo) n'est plus jamais charge pour rien.
      const dim = m.w && m.h ? ` width="${m.w}" height="${m.h}"` : ''
      if (m.thumb && m.view) {
        return `<img src="${m.thumb}" srcset="${m.mini ? `${m.mini} ${SIZES.mini.w}w, ` : ''}${m.thumb} ${SIZES.thumb.w}w, ${m.view} ${SIZES.view.w}w" sizes="(max-width: 768px) 100vw, 720px" alt="${alias || m.stem}"${dim} loading="lazy" decoding="async" class="vault-embed" />`
      }
      return `<img src="${m.url}" alt="${alias || m.stem}"${dim} loading="lazy" decoding="async" class="vault-embed" />`
    }
    if (n && n !== note) {
      if (!note.links.includes(n.id)) note.links.push(n.id)
      return `<a href="/note/${n.id.split('/').map(encodeURIComponent).join('/')}" class="vault-link" data-internal="1">${alias || n.title}</a>`
    }
    if (m) {
      if (!note.media.includes(m.id)) note.media.push(m.id)
      return `<a href="${m.url}" class="vault-link" target="_blank" rel="noreferrer">${alias || m.name}</a>`
    }
    // cible inexistante : rendu grise, comme un lien non resolu dans Obsidian
    return `<span class="vault-link-dead" title="Lien non resolu">${alias || target}</span>`
  })
}

marked.setOptions({ gfm: true, breaks: false })

for (const note of notes) {
  const withLinks = resolveLinks(note)
  note.html = marked.parse(withLinks)
  note.excerpt = note.body
    .replace(/^>.*$/gm, '')
    .replace(/^#.*$/gm, '')
    .replace(WIKILINK, '$2')
    .replace(/[*_`>#\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260)
  // texte brut pour la recherche cote client
  note.search = `${note.title} ${note.path} ${note.tags.join(' ')} ${note.body}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .slice(0, 8000)
}

// backlinks
const byId = new Map(notes.map((n) => [n.id, n]))
for (const note of notes) {
  for (const targetId of note.links) {
    const t = byId.get(targetId)
    if (t && !t.backlinks.includes(note.id)) t.backlinks.push(note.id)
  }
}

// ------------------------------------------------------ univers & disciplines

/**
 * Choisit l'image qui represente le mieux un univers.
 * Priorite : `cover:` dans le frontmatter de la fiche > **le logo** (lockup,
 * logotype, wordmark, icone d'app) > key art / poster > la premiere image.
 *
 * Le logo passe avant le key art : c'est lui qui identifie une app ou une marque
 * d'un coup d'oeil, et le bandeau de la page projet l'affiche en `object-contain`,
 * donc un logotype y est net. Un key art, lui, dit l'ambiance mais pas le nom.
 */
function pickCover(own, fm) {
  const images = own.filter((m) => m.kind === 'image')
  if (!images.length) return null

  if (fm.cover) {
    const wanted = String(fm.cover).split('/').pop().normalize('NFC')
    const hit = images.find((m) => m.name.normalize('NFC') === wanted || m.stem.normalize('NFC') === wanted)
    if (hit) return hit.id
  }

  const PREFER = [
    // Le lockup d'abord : logo + nom ensemble, et son format large remplit le bandeau.
    /(^|[-_])lockup([-_]|$)/i,
    // Puis le nom dessine, plus precis que « logo » tout court.
    /(^|[-_])(logotype|wordmark)([-_]|$)/i,
    /(^|[-_])(logo|logomark|marque)([-_]|$)/i,
    // Pour une app, son icone EST son logo.
    /(^|[-_])(app-?icon|icone?|icon)([-_]|$)/i,
    /(^|[-_])(primary|primaire|principal)([-_]|$)/i,
    /(^|[-_])(cover|key-?art|poster|hero)([-_]|$)/i,
    /(^|[-_])(mascotte|mascot)([-_]|$)/i,
  ]
  // Un visuel de construction, un interdit, une planche de contact ou une
  // sous-marque ne representent pas la marque.
  const AVOID =
    /(^|[-_])(do-not|regle|construction|grille|filaire|clear-?space|planche|sous-marque)/i
  // Ni un visuel d'archive : un projet se presente par son etat actuel.
  const isArchive = (m) => m.folder.split('/').some((seg) => /^archive/i.test(seg))
  // Un logo range dans `branding/` vaut mieux qu'un homonyme trouve ailleurs.
  const BRANDING = /(^|\/)(branding|logos?|identite|identity)(\/|$)/i

  const good = images.filter((m) => !AVOID.test(m.stem) && !isArchive(m))
  const pool = good.length ? good : images
  // A motif egal, dans l'ordre : le vectoriel (net dans le bandeau), le format
  // paysage (le bandeau est large, un logo vertical y flotte), puis `branding/`.
  // Sans ce classement, c'est l'ordre du dossier qui decidait — donc le hasard.
  const paysage = (m) => (m.w && m.h ? m.w / m.h >= 1.2 : false)
  const rang = (m) =>
    (/\.svg$/i.test(m.name) ? 0 : 4) + (paysage(m) ? 0 : 2) + (BRANDING.test(m.folder) ? 0 : 1)

  for (const re of PREFER) {
    const hits = pool.filter((m) => re.test(m.stem)).sort((a, b) => rang(a) - rang(b))
    if (hits.length) return hits[0].id
  }
  // Rien de nomme : au moins un visuel d'identite plutot que le premier venu.
  return (pool.find((m) => BRANDING.test(m.folder)) ?? pool[0]).id
}

/**
 * Un projet = un dossier d'inspiration, quelle que soit sa discipline :
 * `INSPIRATION/UNIVERS/<slug>/` ou `INSPIRATION/<DISCIPLINE>/<slug>/`. Les deux
 * ont exactement la meme forme — une fiche + des medias ranges par aspect
 * (sous-dossier) — donc le site les presente dans un index unique, filtrable
 * par discipline et par tag.
 */
/** Annee affichable : `annee:` telle quelle, sinon l'annee de `date_capture`. */
function annee(fm) {
  if (fm.annee) return String(fm.annee)
  const d = fm.date_capture
  if (!d) return null
  if (d instanceof Date) return String(d.getUTCFullYear())
  const m = String(d).match(/\b(\d{4})\b/)
  return m ? m[1] : null
}

function buildProject(discipline, slug) {
  const prefix = `INSPIRATION/${discipline}/${slug}`
  const own = media.filter((m) => m.folder === prefix || m.folder.startsWith(prefix + '/'))
  const note =
    notes.find((n) => n.folder === prefix && !n.isIndex) ||
    notes.find((n) => n.folder === prefix) ||
    notes.find((n) => n.folder.startsWith(prefix + '/') && !n.isIndex)

  if (!own.length && !note) return null

  const aspectMap = new Map()
  for (const m of own) {
    if (isPlanche(m.folder)) continue
    const aspect = m.folder === prefix ? 'divers' : m.folder.slice(prefix.length + 1).split('/')[0]
    if (!aspectMap.has(aspect)) aspectMap.set(aspect, [])
    aspectMap.get(aspect).push(m.id)
  }
  const aspects = [...aspectMap.entries()]
    .map(([name, ids]) => ({ name, count: ids.length, media: ids }))
    .sort((a, b) => b.count - a.count)

  const fm = note?.frontmatter || {}
  return {
    id: `${discipline}/${slug}`,
    slug,
    discipline,
    disciplineLabel: discipline.replace(/-/g, ' ').toLowerCase(),
    kind: discipline === 'UNIVERS' ? 'univers' : 'inspiration',
    title: fm.univers || note?.title || slug,
    noteId: note?.id || null,
    count: own.filter((m) => !isPlanche(m.folder)).length,
    // Poids des originaux, sur le meme perimetre que `count` (planches
    // exclues) : le chiffre et le poids doivent parler des memes fichiers.
    bytes: own.filter((m) => !isPlanche(m.folder)).reduce((a, m) => a + m.size, 0),
    aspects,
    cover: pickCover(own, fm),
    couleurs: Array.isArray(fm.couleurs) ? fm.couleurs : [],
    couleurPrincipale: fm.couleur_principale || null,
    categorie: fm.categorie || fm.type_app || fm.type_site || null,
    secteur: fm.secteur || null,
    annee: annee(fm),
    source: fm.source || null,
    tags: note?.tags || [],
  }
}

/**
 * Une discipline = un sous-dossier direct d'INSPIRATION. UNIVERS en fait partie
 * comme les autres : c'est une discipline transversale, pas une categorie a part.
 */
const disciplines = []
const projects = []
const inspiRoot = path.join(VAULT, 'INSPIRATION')

if (fs.existsSync(inspiRoot)) {
  for (const e of fs.readdirSync(inspiRoot, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue
    const discipline = e.name
    const prefix = `INSPIRATION/${discipline}`
    const own = media.filter((m) => m.folder === prefix || m.folder.startsWith(prefix + '/'))
    const ownNotes = notes.filter((n) => n.folder === prefix || n.folder.startsWith(prefix + '/'))
    const index = ownNotes.find((n) => n.isIndex)

    // Chaque sous-dossier direct qui a de la matiere devient un projet.
    const slugs = []
    for (const sub of fs.readdirSync(path.join(inspiRoot, discipline), { withFileTypes: true })) {
      if (!sub.isDirectory() || SKIP_DIRS.has(sub.name)) continue
      slugs.push(sub.name)
    }
    const mine = []
    for (const slug of slugs.sort()) {
      const p = buildProject(discipline, slug)
      if (p) mine.push(p)
    }
    projects.push(...mine)

    disciplines.push({
      name: discipline,
      label: discipline.replace(/-/g, ' ').toLowerCase(),
      path: prefix,
      mediaCount: own.length,
      noteCount: ownNotes.filter((n) => !n.isIndex).length,
      projectCount: mine.length,
      indexId: index?.id || null,
      media: own.map((m) => m.id),
      notes: ownNotes.filter((n) => !n.isIndex).map((n) => n.id),
    })
  }
}

// Les plus fournis d'abord : l'index de projets s'ouvre sur ce qui a de la matiere.
projects.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'fr'))

/**
 * Les 2-3 tags qui resument le mieux un projet, pour la vignette de l'index.
 *
 * Deux exclusions, puis un tri :
 *  - les tags de structure (`inspiration`, `univers`) sont sur tout le monde,
 *    donc ne distinguent rien ;
 *  - les tags de discipline (`ui`, `brand`, `web`...) repetent la puce de
 *    discipline deja affichee sur la vignette ;
 *  - le reste est trie du plus RARE au plus commun — un tag porte par un seul
 *    projet le caracterise mieux qu'un tag porte par tous. A frequence egale on
 *    garde l'ordre du frontmatter, qui est celui choisi a la main.
 */
const TAGS_STRUCTURE = new Set(['inspiration', 'univers', 'moc', 'note', 'app', 'site', 'post'])
const TAGS_DISCIPLINE = new Set(['ui', 'ux', 'brand', 'web', 'motion', 'typo', '3d', 'print', 'graphisme'])

const tagFreq = new Map()
for (const p of projects) {
  for (const t of new Set(p.tags)) tagFreq.set(t, (tagFreq.get(t) || 0) + 1)
}

for (const p of projects) {
  const ranked = p.tags
    .map((t, i) => ({ t, i, f: tagFreq.get(t) || 0 }))
    .filter((x) => !TAGS_STRUCTURE.has(x.t))
    .filter((x) => !TAGS_DISCIPLINE.has(x.t))
    .sort((a, b) => a.f - b.f || a.i - b.i)
  // Si le projet n'a que des tags de structure/discipline, on retombe dessus
  // plutot que d'afficher une vignette muette.
  const fallback = p.tags.filter((t) => !TAGS_STRUCTURE.has(t))
  p.topTags = (ranked.length ? ranked.map((x) => x.t) : fallback).slice(0, 3)
}

// ------------------------------------------------------------------- sortie

// Le corps brut n'est plus utile cote client (on sert le HTML) : on l'ecarte
// pour garder un JSON leger. Le HTML rendu et le texte de recherche sortent eux
// aussi de l'index principal — 367 Ko pour 48 notes — et vont dans vault-notes.json.
const notesOut = notes.map(({ body, html, search, ...rest }) => rest)
const notesText = Object.fromEntries(notes.map((n) => [n.id, { html: n.html, search: n.search }]))

const payload = {
  generatedAt: new Date().toISOString(),
  vaultPath: VAULT,
  vaultName: path.basename(VAULT),
  stats: {
    notes: notes.filter((n) => !n.isMeta).length,
    notesTotal: notes.length,
    media: media.length,
    images: media.filter((m) => m.kind === 'image').length,
    videos: media.filter((m) => m.kind === 'video').length,
    tags: tagCounts.size,
    projects: projects.length,
    universes: projects.filter((p) => p.kind === 'univers').length,
    disciplines: disciplines.length,
    bytes: media.reduce((a, m) => a + m.size, 0),
  },
  notes: notesOut,
  media,
  projects,
  disciplines,
  tags: [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(OUT_JSON, JSON.stringify(payload))
fs.writeFileSync(OUT_TEXT, JSON.stringify(notesText))

const mb = (payload.stats.bytes / 1024 / 1024).toFixed(1)
const jsonKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(0)
console.log(`\n  Vault indexe : ${VAULT}`)
console.log(`  ${payload.stats.notesTotal} notes · ${payload.stats.media} medias (${mb} Mo) · ${payload.stats.tags} tags`)
console.log(`  ${payload.stats.projects} projets · ${payload.stats.disciplines} disciplines`)
console.log(`  ${copies} medias copies · ${orphelins} orphelins supprimes`)
console.log(
  `  ${deriv.made} derives crees · ${deriv.reused} reutilises` +
    (deriv.removed ? ` · ${deriv.removed} obsoletes supprimes` : '') +
    ` -> public/derived/ (${(deriv.bytes / 1024 / 1024).toFixed(1)} Mo generes)`
)
const textKb = (fs.statSync(OUT_TEXT).size / 1024).toFixed(0)
console.log(`  -> public/vault.json (${jsonKb} Ko) + vault-notes.json (${textKb} Ko, differe) + public/media/\n`)
