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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const VAULT = process.env.VAULT_PATH || path.join(os.homedir(), 'Documents', 'brain^2')
const OUT_DIR = path.join(ROOT, 'public')
const MEDIA_DIR = path.join(OUT_DIR, 'media')
const OUT_JSON = path.join(OUT_DIR, 'vault.json')

const SKIP_DIRS = new Set(['.git', '.obsidian', '.claude', '.trash', 'node_modules', '__pycache__'])
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

fs.rmSync(MEDIA_DIR, { recursive: true, force: true })
fs.mkdirSync(MEDIA_DIR, { recursive: true })

const media = []
/** basename (avec et sans extension, NFC) -> media, pour resoudre les embeds. */
const mediaByName = new Map()

for (const full of mediaFiles) {
  const rel = path.relative(VAULT, full)
  const dest = path.join(MEDIA_DIR, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(full, dest)

  const stat = fs.statSync(full)
  const ext = path.extname(full).toLowerCase()
  const name = path.basename(full)
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
  }
  media.push(item)
  for (const key of [name, item.stem]) {
    const k = key.normalize('NFC')
    if (!mediaByName.has(k)) mediaByName.set(k, item)
  }
}

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
        return `<video src="${m.url}" controls loop muted playsinline class="vault-embed"></video>`
      }
      return `<img src="${m.url}" alt="${alias || m.stem}" loading="lazy" class="vault-embed" />`
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
 * Priorite : `cover:` dans le frontmatter de la fiche > un visuel d'identite
 * (logo, wordmark, key art) > la premiere image du dossier.
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
    /(^|[-_])(cover|key-?art|poster|hero)([-_]|$)/i,
    /(^|[-_])(logotype|wordmark)([-_]|$)/i,
    /(^|[-_])(logo|lockup)([-_]|$)/i,
    /(^|[-_])(mascotte|mascot)([-_]|$)/i,
  ]
  // Un visuel de construction ou un interdit ne represente pas la marque.
  const AVOID = /(^|[-_])(do-not|regle|construction|grille|filaire|clear-?space)/i

  const good = images.filter((m) => !AVOID.test(m.stem))
  const pool = good.length ? good : images

  for (const re of PREFER) {
    const hit = pool.find((m) => re.test(m.stem))
    if (hit) return hit.id
  }
  return pool[0].id
}

/**
 * Un univers = INSPIRATION/UNIVERS/<slug>/ : une fiche + des medias ranges par
 * aspect (sous-dossier). C'est le contenu le plus visuel du vault.
 */
const universes = []
const uniRoot = 'INSPIRATION/UNIVERS'
const uniDirs = new Set(
  media
    .filter((m) => m.folder.startsWith(uniRoot + '/'))
    .map((m) => m.folder.split('/')[2])
    .filter(Boolean)
)
for (const note of notes) {
  if (note.folder.startsWith(uniRoot + '/')) uniDirs.add(note.folder.split('/')[2])
}

for (const slug of [...uniDirs].sort()) {
  const prefix = `${uniRoot}/${slug}`
  const own = media.filter((m) => m.folder === prefix || m.folder.startsWith(prefix + '/'))
  const note =
    notes.find((n) => n.folder === prefix && !n.isIndex) ||
    notes.find((n) => n.folder === prefix)

  const aspectMap = new Map()
  for (const m of own) {
    const aspect = m.folder === prefix ? 'divers' : m.folder.slice(prefix.length + 1).split('/')[0]
    if (!aspectMap.has(aspect)) aspectMap.set(aspect, [])
    aspectMap.get(aspect).push(m.id)
  }
  const aspects = [...aspectMap.entries()]
    .map(([name, ids]) => ({ name, count: ids.length, media: ids }))
    .sort((a, b) => b.count - a.count)

  const fm = note?.frontmatter || {}
  universes.push({
    slug,
    title: fm.univers || note?.title || slug,
    noteId: note?.id || null,
    count: own.length,
    aspects,
    cover: pickCover(own, fm),
    couleurs: Array.isArray(fm.couleurs) ? fm.couleurs : [],
    couleurPrincipale: fm.couleur_principale || null,
    categorie: fm.categorie || null,
    secteur: fm.secteur || null,
    annee: fm.annee ? String(fm.annee) : null,
    source: fm.source || null,
    tags: note?.tags || [],
  })
}

/**
 * Une discipline = un sous-dossier direct d'INSPIRATION (hors UNIVERS), qui
 * contient soit des dossiers d'inspiration, soit un index transversal.
 */
const disciplines = []
const inspiRoot = path.join(VAULT, 'INSPIRATION')
if (fs.existsSync(inspiRoot)) {
  for (const e of fs.readdirSync(inspiRoot, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name === 'UNIVERS') continue
    const prefix = `INSPIRATION/${e.name}`
    const own = media.filter((m) => m.folder === prefix || m.folder.startsWith(prefix + '/'))
    const ownNotes = notes.filter((n) => n.folder === prefix || n.folder.startsWith(prefix + '/'))
    const index = ownNotes.find((n) => n.isIndex)
    disciplines.push({
      name: e.name,
      label: e.name.replace(/-/g, ' ').toLowerCase(),
      path: prefix,
      mediaCount: own.length,
      noteCount: ownNotes.filter((n) => !n.isIndex).length,
      indexId: index?.id || null,
      media: own.map((m) => m.id),
      notes: ownNotes.filter((n) => !n.isIndex).map((n) => n.id),
    })
  }
}

// ------------------------------------------------------------------- sortie

// Le corps brut n'est plus utile cote client (on sert le HTML) : on l'ecarte
// pour garder un JSON leger.
const notesOut = notes.map(({ body, ...rest }) => rest)

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
    universes: universes.length,
    disciplines: disciplines.length,
    bytes: media.reduce((a, m) => a + m.size, 0),
  },
  notes: notesOut,
  media,
  universes,
  disciplines,
  tags: [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(OUT_JSON, JSON.stringify(payload))

const mb = (payload.stats.bytes / 1024 / 1024).toFixed(1)
const jsonKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(0)
console.log(`\n  Vault indexe : ${VAULT}`)
console.log(`  ${payload.stats.notesTotal} notes · ${payload.stats.media} medias (${mb} Mo) · ${payload.stats.tags} tags`)
console.log(`  ${payload.stats.universes} univers · ${payload.stats.disciplines} disciplines`)
console.log(`  -> public/vault.json (${jsonKb} Ko) + public/media/\n`)
