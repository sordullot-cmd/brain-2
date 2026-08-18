/**
 * Derives legers pour l'affichage web.
 *
 * Le vault contient les originaux en pleine qualite — c'est sa raison d'etre —
 * mais un PNG de 11 Mo en 4010x8055 pose dans une tuile de 168 px fait tomber
 * l'onglet : le navigateur telecharge tout, puis decode l'image en RAM a sa
 * taille NATIVE (ici ~130 Mo de bitmap, pour une vignette). Multiplie par cent
 * tuiles, la page ne repond plus.
 *
 * On produit donc deux tailles en WebP :
 *   thumb : les grilles et les planches
 *   view  : la visionneuse plein ecran
 * L'original reste servi tel quel, et reste accessible depuis la visionneuse.
 *
 * Les SVG ne sont pas touches (vectoriels, deja legers). Les videos donnent une
 * image d'affiche extraite avec ffmpeg, pour ne plus monter un <video> par tuile.
 *
 * Tout est mis en cache sur (chemin, mtime, taille) : une reindexation qui ne
 * change rien ne recalcule rien.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** Largeur/hauteur maximales de chaque derive. */
export const SIZES = {
  thumb: { w: 640, h: 1400, quality: 72 },
  view: { w: 1800, h: 3600, quality: 80 },
}

const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tif', '.tiff', '.bmp'])

let sharp = null
async function getSharp() {
  if (sharp === null) {
    try {
      sharp = (await import('sharp')).default
      sharp.cache(false) // des milliers de fichiers : on ne garde rien en memoire
      sharp.concurrency(Math.max(1, (await import('node:os')).cpus().length - 1))
    } catch {
      sharp = false
    }
  }
  return sharp
}

/**
 * On memoise la PROMESSE, pas un booleen.
 *
 * La version « drapeau » posait `ffmpegChecked = true` avant la fin du test :
 * les jobs video partant tous en parallele, les suivants lisaient « deja
 * verifie » alors que `hasFfmpeg` valait encore false, et sortaient en silence.
 * Resultat : seules les deux premieres videos avaient une affiche.
 */
let ffmpegProbe = null
function checkFfmpeg() {
  ffmpegProbe ??= exec('ffmpeg', ['-version']).then(
    () => true,
    () => false
  )
  return ffmpegProbe
}

/** URL publique d'un derive, chaque segment encode comme pour /media. */
const derivedUrl = (variant, rel) =>
  `/derived/${variant}/` + rel.split(path.sep).map(encodeURIComponent).join('/') + '.webp'

export async function buildDerivatives({ outDir, items, log = () => {} }) {
  const dir = path.join(outDir, 'derived')
  const cachePath = path.join(dir, 'cache.json')

  let cache = {}
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    cache = {}
  }

  const S = await getSharp()
  if (!S) {
    log('  ! sharp absent : les originaux sont servis tels quels (site lourd). npm i -D sharp')
    return { made: 0, reused: 0, skipped: items.length, bytes: 0 }
  }

  const next = {}
  let made = 0
  let reused = 0
  let bytes = 0
  const jobs = []

  for (const m of items) {
    const ext = '.' + m.ext
    const isRaster = m.kind === 'image' && RASTER.has(ext)
    const isVideo = m.kind === 'video'
    if (!isRaster && !isVideo) continue

    const key = m.path
    const stamp = `${m.mtime}:${m.size}`
    const hit = cache[key]

    // Le cache n'est valable que si les fichiers produits sont toujours la.
    const outs = isVideo ? ['thumb'] : ['thumb', 'view']
    const paths = Object.fromEntries(outs.map((v) => [v, path.join(dir, v, key + '.webp')]))
    const allThere = outs.every((v) => fs.existsSync(paths[v]))

    if (hit && hit.stamp === stamp && allThere) {
      next[key] = hit
      for (const v of outs) m[v] = derivedUrl(v, key)
      if (hit.dw && hit.dh) {
        m.dw = hit.dw
        m.dh = hit.dh
      }
      reused++
      continue
    }

    jobs.push(
      (async () => {
        try {
          let source = m.absPath
          let tmp = null

          if (isVideo) {
            if (!(await checkFfmpeg())) return
            tmp = path.join(dir, '.tmp-' + Math.abs(hashCode(key)) + '.png')
            fs.mkdirSync(path.dirname(tmp), { recursive: true })
            // Une frame a ~1 s : la toute premiere est souvent noire. Certains
            // fichiers refusent le seek, d'ou la reprise sans -ss.
            // Pas de `-vsync` : l'option a ete supprimee dans ffmpeg 9 et fait
            // echouer toute la commande (« Unrecognized option 'vsync' »).
            const frame = (args) => exec('ffmpeg', ['-y', ...args, '-frames:v', '1', '-update', '1', tmp])
            try {
              await frame(['-ss', '1', '-i', m.absPath])
            } catch {
              /* on retente sans seek juste apres */
            }
            if (!fs.existsSync(tmp)) {
              try {
                await frame(['-i', m.absPath])
              } catch {
                /* pas d'affiche pour ce fichier : signale plus bas */
              }
            }
            if (!fs.existsSync(tmp)) {
              log(`  ! pas d'image d'affiche : ${key}`)
              return
            }
            source = tmp
          }

          const rec = { stamp }
          for (const v of outs) {
            const { w, h, quality } = SIZES[v]
            fs.mkdirSync(path.dirname(paths[v]), { recursive: true })
            const info = await S(source, { failOn: 'none', limitInputPixels: false })
              .rotate()
              .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
              .webp({ quality, effort: 4 })
              .toFile(paths[v])
            m[v] = derivedUrl(v, key)
            bytes += info.size
            if (v === 'thumb') {
              rec.dw = info.width
              rec.dh = info.height
              m.dw = info.width
              m.dh = info.height
            }
          }
          next[key] = rec
          made++

          if (tmp) fs.rmSync(tmp, { force: true })
        } catch (e) {
          log(`  ! derive impossible : ${key} (${String(e.message || e).slice(0, 70)})`)
        }
      })()
    )
  }

  // sharp est deja parallele en interne : on borne la file pour ne pas ouvrir
  // des milliers de descripteurs d'un coup.
  const BATCH = 24
  for (let i = 0; i < jobs.length; i += BATCH) await Promise.all(jobs.slice(i, i + BATCH))

  // Purge des derives dont la source a disparu.
  let removed = 0
  for (const v of Object.keys(SIZES)) {
    const root = path.join(dir, v)
    if (!fs.existsSync(root)) continue
    for (const f of walkFiles(root)) {
      const key = path.relative(root, f).replace(/\.webp$/, '').split(path.sep).join('/')
      if (!next[key]) {
        fs.rmSync(f, { force: true })
        removed++
      }
    }
  }

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(next))

  return { made, reused, removed, bytes }
}

function* walkFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walkFiles(full)
    else if (e.name.endsWith('.webp')) yield full
  }
}

function hashCode(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
