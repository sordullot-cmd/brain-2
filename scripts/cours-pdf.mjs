#!/usr/bin/env node
/**
 * « Tout le cours » en PDF : une matière entière, tous ses chapitres, réduits
 * au cours comme sur la page /cours. Demande de Sacha (12 octobre 2026) : un
 * bouton pour télécharger le PDF de tout le cours.
 *
 *   node scripts/cours-pdf.mjs          # toutes les matières
 *   node scripts/cours-pdf.mjs 12A      # une seule
 *   → public/cours-pdf/UE-<ue>.pdf
 *
 * À lancer après `npm run index` : le PDF est imprimé depuis l'index. Le site
 * est servi en local le temps de l'impression, et la page imprimée
 * (cours-pdf-page.ts) reprend le code du site — le regroupement par matière et
 * l'épuration —, si bien que le PDF ne peut pas dire autre chose que la page.
 * La charte est celle des condensés (skill /fiche-pdf du vault), en plus aéré :
 * c'est un cours qu'on lit, pas deux pages qu'on affiche au mur.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { build } from 'esbuild'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(SITE, 'public')
const SORTIE = join(PUBLIC, 'cours-pdf')
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find(existsSync)

if (!CHROME) {
  console.error('cours-pdf : Chrome introuvable, il imprime le PDF.')
  process.exit(1)
}
if (!existsSync(join(PUBLIC, 'vault.json'))) {
  console.error('cours-pdf : public/vault.json absent, lance npm run index.')
  process.exit(1)
}

/* ---------------------------------------------------------------- la page */

const bundle = await build({
  entryPoints: [join(SITE, 'scripts/cours-pdf-page.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  logLevel: 'error',
})
const script = bundle.outputFiles[0].text

const CSS = `
  @page {
    size: A4; margin: 14mm 15mm 16mm;
    @bottom-right { content: counter(page) " / " counter(pages); font: 7.6pt -apple-system, Helvetica, sans-serif; color: #8a909c; }
  }
  :root {
    --encre: #16181d; --gris: #5d6370; --filet: #d9dce2; --fond: #f4f5f7;
    --alerte: #d92d5e; --prudence: #c2761a; --test: #10b981; --astuce: #0e8ba8; --resume: #1f2a44;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: var(--encre); background: #fff;
    font: 10pt/1.5 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    hyphens: auto; text-wrap: pretty;
  }
  .couverture { padding-top: 40mm; }
  .titre-cours { font-size: 26pt; line-height: 1.1; letter-spacing: -0.5px; margin: 2mm 0 3mm; }
  .date { color: var(--gris); margin: 0 0 14mm; }
  .sommaire { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--filet); }
  .sommaire li { display: flex; gap: 5mm; padding: 2.4mm 0; border-bottom: 1px solid var(--filet); font-size: 11pt; }
  .sommaire .num, .sur-titre { color: var(--gris); font-variant-numeric: tabular-nums; }
  .sur-titre { text-transform: uppercase; letter-spacing: 0.6px; font-size: 8pt; margin: 0; }
  .chapitre { break-before: page; }
  h1 { font-size: 19pt; line-height: 1.15; letter-spacing: -0.3px; margin: 1mm 0 5mm; }
  h2 {
    font-size: 13pt; margin: 7mm 0 2.4mm; padding-bottom: 1mm;
    border-bottom: 1.4px solid var(--encre); break-after: avoid;
  }
  h3 { font-size: 11pt; margin: 4.5mm 0 1.4mm; break-after: avoid; }
  h4 { font-size: 10pt; margin: 3mm 0 1mm; color: var(--gris); break-after: avoid; }
  a { color: inherit; text-decoration: none; }
  p { margin: 1.6mm 0; }
  ul, ol { margin: 1.6mm 0; padding-left: 5mm; }
  li { margin: 0.6mm 0; }
  strong { font-weight: 650; }
  mark { background: #fff1a8; padding: 0 0.5mm; }
  code { font: 9pt/1.3 ui-monospace, Menlo, monospace; background: var(--fond); padding: 0 0.8mm; border-radius: 2px; }
  hr { border: 0; border-top: 1px solid var(--filet); margin: 4mm 0; }
  blockquote { margin: 2mm 0; padding: 1mm 3.5mm; border-left: 2.5px solid var(--encre); background: var(--fond); }
  table { width: 100%; border-collapse: collapse; margin: 2.4mm 0; font-size: 9.2pt; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid var(--filet); padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
  th { background: var(--fond); font-weight: 650; }
  img { display: block; max-width: 78%; max-height: 90mm; height: auto; margin: 3mm auto; break-inside: avoid; }
  figure { margin: 3mm 0; }
  figcaption { text-align: center; color: var(--gris); font-size: 8.6pt; }
  .katex { font-size: 1.05em; }
  .callout {
    margin: 3mm 0; padding: 2.2mm 3.2mm; border: 1px solid var(--filet);
    border-left: 2.5px solid var(--gris); border-radius: 2mm; background: var(--fond);
    break-inside: avoid;
  }
  .callout-title { margin: 0 0 1mm; font-weight: 700; list-style: none; }
  .callout-body > :first-child { margin-top: 0; }
  .callout-body > :last-child { margin-bottom: 0; }
  .callout-alerte { border-left-color: var(--alerte); } .callout-alerte .callout-title { color: var(--alerte); }
  .callout-prudence { border-left-color: var(--prudence); } .callout-prudence .callout-title { color: var(--prudence); }
  .callout-test { border-left-color: var(--test); }
  .callout-astuce { border-left-color: var(--astuce); } .callout-astuce .callout-title { color: var(--astuce); }
  .callout-resume { border-left-color: var(--resume); background: #eef1f7; }
  details summary::-webkit-details-marker { display: none; }
`

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Cours</title>
<link rel="stylesheet" href="/__pdf/katex.css">
<style>${CSS}</style></head>
<body><script src="/__pdf/page.js"></script></body></html>`

/* ------------------------------------------------- le site, servi en local */

const TYPES = {
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.css': 'text/css',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
}
const KATEX = join(SITE, 'node_modules/katex/dist')

const serveur = createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (chemin === '/__pdf/page.html') return envoyer(res, PAGE, 'text/html; charset=utf-8')
  if (chemin === '/__pdf/page.js') return envoyer(res, script, 'text/javascript; charset=utf-8')
  if (chemin === '/__pdf/katex.css') return envoyer(res, readFileSync(join(KATEX, 'katex.min.css')), 'text/css')
  const fichier = chemin.startsWith('/__pdf/fonts/') ? join(KATEX, chemin.slice(7)) : join(PUBLIC, chemin)
  if (!fichier.startsWith(PUBLIC) && !fichier.startsWith(KATEX)) return envoyer(res, '', 'text/plain', 403)
  if (!existsSync(fichier) || !statSync(fichier).isFile()) return envoyer(res, '', 'text/plain', 404)
  envoyer(res, readFileSync(fichier), TYPES[extname(fichier).toLowerCase()] ?? 'application/octet-stream')
})
function envoyer(res, corps, type, code = 200) {
  res.writeHead(code, { 'Content-Type': type })
  res.end(corps)
}
await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${serveur.address().port}/__pdf/page.html`

/* ------------------------------------------------------------ l'impression */

try {
  // Chrome en asynchrone : le serveur doit pouvoir lui répondre pendant qu'il tourne.
  const lancer = (args) =>
    new Promise((ok, ko) =>
      execFile(
        CHROME,
        ['--headless=new', '--disable-gpu', '--virtual-time-budget=30000', ...args],
        { maxBuffer: 64 * 1024 * 1024 },
        (e, stdout) => (e ? ko(e) : ok(stdout))
      )
    )

  const dom = await lancer(['--dump-dom', `${BASE}?liste`])
  const json = /<body[^>]*>([\s\S]*?)<\/body>/.exec(dom)?.[1] ?? '[]'
  let liste = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  const voulue = process.argv[2]
  if (voulue) liste = liste.filter((m) => m.ue === voulue)

  mkdirSync(SORTIE, { recursive: true })
  for (const m of liste) {
    const pdf = join(SORTIE, `UE-${m.ue}.pdf`)
    await lancer(['--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `${BASE}?ue=${encodeURIComponent(m.ue)}`])
    const pages = (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
    console.log(`  -> public/cours-pdf/UE-${m.ue}.pdf  ${m.nom} · ${m.chapitres} chapitre(s) · ${pages} pages`)
  }
} finally {
  serveur.close()
}
