#!/usr/bin/env node
/**
 * Synchronisation des suppressions — « supprime dans le vault, supprime partout ».
 *
 * Supprimer un fichier dans Obsidian ne suffisait pas. L'index se refait bien
 * tout seul, mais le site sert le `public/` COMMITE (Vercel construit avec le
 * seul `vite build`), et le depot du vault gardait la suppression en attente :
 * un pull — ou la synchro Supabase — ramenait le fichier. Cette commande ferme
 * la chaine, dans cet ordre :
 *
 *   1. les revenants d'abord : un fichier deja supprime une fois et revenu
 *      identique repart a la corbeille, avant meme d'etre reindexe ;
 *   2. ce qui a disparu entre au journal (`scripts/supprimes.json`, versionne :
 *      c'est la memoire des suppressions, ce qui permet de reconnaitre un
 *      revenant au passage suivant) ;
 *   3. reindexation complete — elle purge public/media et public/derived ;
 *   4. commit + push des suppressions dans le vault, puis du `public/` de la
 *      galerie. Vercel redeploie, et l'app de bureau suit : c'est une fenetre
 *      sur le deploiement.
 *
 * Usage :  npm run sync             (fait tout)
 *          npm run sync -- --dry    (montre, ne touche a rien)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VAULT = process.env.VAULT_PATH || path.join(os.homedir(), 'Documents', 'brain^2')
const JOURNAL = path.join(__dirname, 'supprimes.json')
/** Quarantaine des revenants : hors du vault, hors de git, mais recuperable. */
const QUARANTAINE = path.join(ROOT, '.corbeille')
const INDEX_JSON = path.join(ROOT, 'public', 'vault.json')

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

/** Memes exclusions que l'indexeur : ce qu'il ignore n'a jamais ete « sur le site ». */
const SKIP_DIRS = new Set(['.git', '.obsidian', '.claude', '.trash', 'node_modules', '__pycache__'])
const SKIP_FILES = new Set(['.DS_Store', '.gitattributes'])

/** Un chemin de contenu : ni fichier de reglage, ni dossier technique. */
const contenu = (rel) =>
  !rel.split('/').some((s) => SKIP_DIRS.has(s)) && !SKIP_FILES.has(rel.split('/').pop())

const dit = (s = '') => console.log(s)
/** Date du jour, pour ranger la quarantaine par passage. */
const JOUR = new Date().toISOString().slice(0, 10)
const abs = (rel) => path.join(VAULT, ...rel.split('/'))

// ------------------------------------------------------------------ le vault

/** Chemins relatifs (POSIX) de tout ce que l'indexeur verrait, avec leur taille. */
function scanVault(dir = VAULT, acc = new Map()) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (e.name.startsWith('._') || SKIP_FILES.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      scanVault(full, acc)
    } else if (e.isFile()) {
      acc.set(path.relative(VAULT, full).split(path.sep).join('/'), fs.statSync(full).size)
    }
  }
  return acc
}

/**
 * En quarantaine plutot qu'un `rm` sec : une re-suppression automatique doit
 * rester rattrapable. Le fichier sort du vault (donc du site, et de la synchro
 * qui l'avait ramene) mais reste sur le disque, range par date dans
 * `.corbeille/` — ignore par git. La corbeille du systeme n'est pas toujours
 * accessible a un script, celle-ci l'est toujours.
 */
function quarantaine(rel) {
  const dest = path.join(QUARANTAINE, JOUR, ...rel.split('/'))
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(abs(rel), dest)
  } catch {
    fs.rmSync(abs(rel), { force: true })
  }
}

// ----------------------------------------------------------------- le journal

/** `{ chemin: { taille, le } }` — la taille sert a reconnaitre un revenant. */
function lireJournal() {
  try {
    return JSON.parse(fs.readFileSync(JOURNAL, 'utf8'))
  } catch {
    return {}
  }
}

function ecrireJournal(j) {
  if (DRY) return
  const trie = Object.fromEntries(Object.entries(j).sort(([a], [b]) => a.localeCompare(b)))
  fs.writeFileSync(JOURNAL, JSON.stringify(trie, null, 2) + '\n')
}

// --------------------------------------------------------------------- git

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git ${args[0]} : ${(r.stderr || r.stdout || '').trim()}`)
  return (r.stdout || '').trim()
}

/** Comme `git`, mais une commande qui echoue rend `null` au lieu de lever. */
function gitOu(cwd, args) {
  try {
    return git(cwd, args)
  } catch {
    return null
  }
}

/**
 * Commit des seuls chemins demandes, jamais `git add -A` tout court : le vault a
 * toujours des notes en cours d'ecriture et la galerie du code non fini. On ne
 * commite que ce que cette commande a produit.
 */
function commitEtPousse(cwd, chemins, message) {
  // Un chemin ni present sur le disque ni suivi par git n'a rien a mettre en
  // scene — sa suppression est deja commitee — et `git add` en ferait une
  // erreur. C'est le cas normal d'un revenant remis a la corbeille.
  const utiles = chemins.filter(
    (rel) => fs.existsSync(path.join(cwd, rel)) || gitOu(cwd, ['ls-files', '--', rel])
  )
  if (!utiles.length) return null
  if (DRY) return `(dry) ${utiles.length} chemin(s) — « ${message} »`
  chemins = utiles

  // `add -A <chemin>` prend aussi bien la disparition que la modification.
  for (let i = 0; i < chemins.length; i += 100) git(cwd, ['add', '-A', '--', ...chemins.slice(i, i + 100)])
  if (!git(cwd, ['diff', '--cached', '--name-only'])) return null

  git(cwd, ['commit', '-m', message])
  const branche = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const pousse = gitOu(cwd, ['push', 'origin', branche])
  return pousse === null ? `commit fait, push refuse (a relancer a la main)` : `pousse sur ${branche}`
}

// ---------------------------------------------------- ce que le site connait

/** Chemins vus par le dernier index, avec leur taille : la reference du site. */
function connusDeLIndex() {
  const m = new Map()
  try {
    const d = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'))
    for (const n of d.notes) m.set(n.path, n.size ?? 0)
    for (const x of d.media) m.set(x.path, x.size ?? 0)
  } catch {
    /* premier passage, ou index absent */
  }
  return m
}

// ------------------------------------------------------------------ la passe

if (!fs.existsSync(VAULT)) {
  console.error(`\n  Vault introuvable : ${VAULT}`)
  console.error(`  Donne le bon chemin :  VAULT_PATH="/chemin/vers/le/vault" npm run sync\n`)
  process.exit(1)
}

dit(`\n  Vault : ${VAULT}${DRY ? '    (dry run — rien ne sera touche)' : ''}\n`)

const journal = lireJournal()
let present = scanVault()

/* 1 — les revenants -------------------------------------------------------- */

const revenus = []
const reprises = []
for (const [rel, memo] of Object.entries(journal)) {
  if (!present.has(rel)) continue
  if (present.get(rel) === memo.taille) {
    // Meme chemin, meme poids : c'est la copie qui revient, pas un nouveau texte.
    revenus.push(rel)
    if (!DRY) quarantaine(rel)
  } else {
    // La taille a change : ce chemin a ete REPRIS volontairement. On le garde,
    // et le journal l'oublie — sinon on supprimerait un vrai texte.
    reprises.push(rel)
    delete journal[rel]
  }
}

if (revenus.length) {
  dit(`  Revenants sortis du vault : ${revenus.length}  ->  .corbeille/${JOUR}/`)
  for (const r of revenus) dit(`    ↩  ${r}`)
  if (!DRY) present = scanVault()
}
if (reprises.length) {
  dit(`  Chemins repris depuis (gardes, sortis du journal) : ${reprises.length}`)
  for (const r of reprises) dit(`    ✎  ${r}`)
}

/* 2 — ce qui a disparu ----------------------------------------------------- */

// Deux sources, parce qu'aucune ne suffit seule : l'index dit ce que le SITE
// montre encore, mais un `npm run dev` lance entre-temps l'a deja oublie ; git
// dit ce que le VAULT a perdu, y compris avant toute reindexation.
const connus = connusDeLIndex()
const parIndex = [...connus.keys()].filter((rel) => !present.has(rel))
const parGit = (gitOu(VAULT, ['ls-files', '--deleted']) ?? '')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s && contenu(s) && !present.has(s))

const disparus = [...new Set([...parIndex, ...parGit])].filter((rel) => !journal[rel]).sort()

for (const rel of disparus) {
  // La taille au moment ou le fichier existait : l'index la connait, sinon on
  // la demande a git (l'objet est encore dans HEAD).
  const taille = connus.get(rel) ?? Number(gitOu(VAULT, ['cat-file', '-s', `HEAD:${rel}`]) ?? 0)
  journal[rel] = { taille, le: new Date().toISOString() }
}
ecrireJournal(journal)

if (disparus.length) {
  dit(`\n  Supprimes depuis le dernier passage : ${disparus.length}`)
  for (const r of disparus.slice(0, 40)) dit(`    −  ${r}`)
  if (disparus.length > 40) dit(`    …  et ${disparus.length - 40} autres`)
} else if (!revenus.length) {
  dit('  Rien de neuf du cote des suppressions.')
}

/* 3 — reindexation (elle purge public/media et public/derived) -------------- */

dit('\n  Reindexation…\n')
if (!DRY) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'index-vault.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    console.error("\n  L'indexation a echoue : rien n'est commite.\n")
    process.exit(r.status ?? 1)
  }
}

/* 4 — commits -------------------------------------------------------------- */

const resume = (liste) => {
  const noms = liste.slice(0, 3).map((rel) => rel.split('/').pop())
  return liste.length > 3 ? `${noms.join(', ')} +${liste.length - 3}` : noms.join(', ')
}

/** Ce que cette passe a fait disparaitre, et qui est bien absent du disque. */
const partis = [...new Set([...disparus, ...revenus])].filter((rel) => !fs.existsSync(abs(rel)))

let etatVault
try {
  etatVault = commitEtPousse(VAULT, partis, `suppressions : ${resume(partis)} — retirees pour de bon`)
} catch (e) {
  etatVault = `echec : ${String(e.message).split('\n')[0]}`
}

let etatSite
try {
  etatSite = commitEtPousse(
    ROOT,
    ['public', path.relative(ROOT, JOURNAL)],
    partis.length
      ? `sync : ${partis.length} fichier(s) retire(s) du site — ${resume(partis)}`
      : "sync : maj de l'index depuis le vault"
  )
} catch (e) {
  etatSite = `echec : ${String(e.message).split('\n')[0]}`
}

dit('')
dit(`  Vault    ${etatVault ?? 'rien a commiter'}`)
dit(`  Galerie  ${etatSite ?? 'rien a commiter'}`)
dit("\n  Le site se redeploie tout seul ; l'app de bureau est une fenetre dessus, elle suivra.\n")
