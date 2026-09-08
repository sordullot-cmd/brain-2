#!/usr/bin/env node
/**
 * Fusion de projets du vault — plusieurs dossiers d'un meme sujet en un seul.
 *
 * Un sujet finit parfois eclate en plusieurs dossiers (la marque d'un cote, le
 * produit de l'autre, une reprise deux ans plus tard) : trois fiches a tenir,
 * trois entrees dans l'index, et les memes visuels ranges deux fois. Ce script
 * fait la partie mecanique du regroupement :
 *
 *   - les medias des sources rejoignent l'aspect de meme nom dans la cible
 *     (`branding/` avec `branding/`, `ui/` avec `ui/`…), les aspects inconnus
 *     de la cible sont crees ;
 *   - un fichier deja present a l'identique (meme empreinte) n'est pas copie
 *     deux fois : la copie part en quarantaine, elle n'est pas effacee ;
 *   - un homonyme au contenu DIFFERENT est renomme avec le nom de son dossier
 *     d'origine en suffixe, et signale — les embeds `![[nom]]` des fiches se
 *     resolvent par nom de fichier, il faut savoir lesquels reecrire.
 *
 * Les fiches `.md` ne sont jamais touchees : leur fusion est un travail de
 * texte, pas de fichiers. Le script les laisse en place et les liste a la fin.
 *
 * Usage :
 *   node scripts/fusionner.mjs <cible> <source> [source…] [--dry]
 *   node scripts/fusionner.mjs INSPIRATION/UNIVERS/duolingo \
 *        INSPIRATION/UNIVERS/duolingo-2026 INSPIRATION/UI-DESIGN/duolingo-app
 *
 * Les chemins sont relatifs au vault (VAULT_PATH, sinon ~/Documents/brain^2).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VAULT = process.env.VAULT_PATH || path.join(os.homedir(), 'Documents', 'brain^2')
const JOUR = new Date().toISOString().slice(0, 10)
const QUARANTAINE = path.join(ROOT, '.corbeille', JOUR, 'fusion')

const args = process.argv.slice(2)
const DRY = args.includes('--dry') || args.includes('--dry-run')
const [cible, ...sources] = args.filter((a) => !a.startsWith('--'))

if (!cible || !sources.length) {
  console.error('\n  Usage : node scripts/fusionner.mjs <cible> <source…> [--dry]\n')
  process.exit(1)
}

const abs = (rel) => path.join(VAULT, ...rel.split('/'))
const dit = (s = '') => console.log(s)

for (const rel of [cible, ...sources]) {
  if (!fs.existsSync(abs(rel))) {
    console.error(`\n  Dossier introuvable : ${rel}\n`)
    process.exit(1)
  }
}

/** Tous les fichiers d'un dossier, chemins relatifs a ce dossier. */
function fichiers(racine, dir = racine, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) fichiers(racine, full, acc)
    else if (e.isFile()) acc.push(path.relative(racine, full).split(path.sep).join('/'))
  }
  return acc
}

const empreinte = (full) => crypto.createHash('md5').update(fs.readFileSync(full)).digest('hex')

/** Deplace en gardant l'arborescence, sous la quarantaine du jour. */
function enQuarantaine(source, rel) {
  const dest = path.join(QUARANTAINE, source.split('/').pop(), ...rel.split('/'))
  if (DRY) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(abs(`${source}/${rel}`), dest)
}

// -------------------------------------------------- ce que la cible contient

/**
 * empreinte -> { rel, origine } de ce qui est deja range dans la cible.
 *
 * La deduplication ne joue qu'ENTRE dossiers : deux fichiers identiques sous
 * des noms differents a l'interieur d'un meme dossier sont un choix de
 * rangement (un jeu d'icones qui reutilise le meme dessin), pas un doublon de
 * fusion — les ecarter reviendrait a modifier le projet, pas a le fusionner.
 */
const connues = new Map()
for (const rel of fichiers(abs(cible))) {
  if (rel.endsWith('.md')) continue
  connues.set(empreinte(abs(`${cible}/${rel}`)), { rel, origine: cible })
}

dit(`\n  Cible   ${cible}  (${connues.size} medias)`)
dit(`  Sources ${sources.join(', ')}${DRY ? '    (dry run — rien ne bouge)' : ''}\n`)

// ------------------------------------------------------------- la fusion

const deplaces = []
const doublons = []
const renommes = []
const fiches = []

for (const source of sources) {
  const marque = source.split('/').pop() // sert de suffixe en cas d'homonyme
  for (const rel of fichiers(abs(source))) {
    const plein = abs(`${source}/${rel}`)
    if (rel.endsWith('.md')) {
      fiches.push(`${source}/${rel}`)
      continue
    }

    const h = empreinte(plein)
    const deja = connues.get(h)
    if (deja && deja.origine !== source) {
      // Deja la, au bit pres, et venu d'ailleurs : une seule copie suffit.
      doublons.push([`${source}/${rel}`, deja.rel])
      enQuarantaine(source, rel)
      continue
    }

    // Meme aspect, meme sous-dossier : c'est le rangement qui est repris.
    let destRel = rel
    if (fs.existsSync(abs(`${cible}/${destRel}`))) {
      const ext = path.extname(rel)
      destRel = `${rel.slice(0, -ext.length)}-${marque}${ext}`
      renommes.push([`${source}/${rel}`, `${cible}/${destRel}`])
    }

    if (!DRY) {
      fs.mkdirSync(path.dirname(abs(`${cible}/${destRel}`)), { recursive: true })
      fs.renameSync(plein, abs(`${cible}/${destRel}`))
    }
    if (!connues.has(h)) connues.set(h, { rel: destRel, origine: source })
    deplaces.push([`${source}/${rel}`, destRel])
  }
}

/**
 * Les embeds `![[nom]]` se resolvent par nom de fichier : un doublon ecarte
 * dont le nom differe de celui qu'on garde laisserait un lien mort dans les
 * fiches. On fait suivre la reference au fichier conserve.
 */
const reecrits = []
if (!DRY) {
  const paires = doublons
    .map(([src, garde]) => [src.split('/').pop(), garde.split('/').pop()])
    .filter(([a, b]) => a !== b)
  if (paires.length) {
    for (const md of fichiers(VAULT).filter((f) => f.endsWith('.md'))) {
      if (md.split('/').some((seg) => ['.git', '.obsidian', '.trash', '.claude'].includes(seg))) continue
      const plein = path.join(VAULT, ...md.split('/'))
      const avant = fs.readFileSync(plein, 'utf8')
      let apres = avant
      for (const [a, b] of paires) apres = apres.split(a).join(b)
      if (apres !== avant) {
        fs.writeFileSync(plein, apres)
        reecrits.push(md)
      }
    }
  }
}

// Les dossiers vides restants n'ont plus de raison d'etre.
let vides = 0
if (!DRY) {
  for (const source of sources) {
    ;(function nettoie(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) nettoie(path.join(dir, e.name))
      }
      if (!fs.readdirSync(dir).length) {
        fs.rmdirSync(dir)
        vides++
      }
    })(abs(source))
  }
}

// ------------------------------------------------------------------ rapport

const parAspect = new Map()
for (const [, dest] of deplaces) {
  const a = dest.includes('/') ? dest.split('/')[0] : '(racine)'
  parAspect.set(a, (parAspect.get(a) ?? 0) + 1)
}

dit(`  Medias deplaces : ${deplaces.length}`)
for (const [a, n] of [...parAspect].sort((x, y) => y[1] - x[1])) dit(`    ${String(n).padStart(4)}  ${a}/`)

if (doublons.length) {
  dit(`\n  Doublons ecartes (quarantaine .corbeille/${JOUR}/fusion/) : ${doublons.length}`)
  for (const [src, deja] of doublons.slice(0, 20)) dit(`    =  ${src}\n       deja present en ${deja}`)
  if (doublons.length > 20) dit(`    …  et ${doublons.length - 20} autres`)
}

if (renommes.length) {
  dit(`\n  Homonymes au contenu different, renommes — a corriger dans les fiches :`)
  for (const [src, dest] of renommes) dit(`    ✎  ${src}\n       -> ${dest}`)
}

if (reecrits.length) {
  dit(`\n  Fiches ou une reference pointait vers un doublon ecarte, corrigees : ${reecrits.length}`)
  for (const f of reecrits) dit(`    ✎  ${f}`)
}

if (fiches.length) {
  dit(`\n  Fiches laissees en place (a fusionner a la main) :`)
  for (const f of fiches) dit(`    •  ${f}`)
}

if (vides) dit(`\n  ${vides} dossier(s) vide(s) retire(s).`)
dit(`\n  Relancer ensuite :  npm run index\n`)
