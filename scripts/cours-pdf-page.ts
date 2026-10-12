/* --------------------------------------------------------------------------
   La page que Chrome imprime pour « Tout le cours (PDF) » — voir cours-pdf.mjs.

   Elle tourne dans le navigateur, sur le site servi en local, et reprend le
   code du site lui-même : le regroupement des chapitres par matière (dans
   l'ordre du plan) et l'épuration qui réduit une fiche au cours. Le PDF dit
   donc exactement ce que dit la page /cours, ni plus ni moins.

     ?liste      → écrit la liste des matières (JSON) dans la page
     ?ue=12A     → la matière entière, chapitre après chapitre
   -------------------------------------------------------------------------- */
import { loadVault, loadNotesText, matieres, titreChapitre } from '../src/lib/vault'
import { epurerCours } from '../src/lib/epurer'

const fin = () => document.body.setAttribute('data-pret', '1')

async function main() {
  const params = new URLSearchParams(location.search)
  const vault = await loadVault()
  const { liste } = matieres(vault)

  if (params.has('liste')) {
    document.body.textContent = JSON.stringify(liste.map((m) => ({ ue: m.ue, nom: m.nom, chapitres: m.chapitres.length })))
    return fin()
  }

  const m = liste.find((x) => x.ue === params.get('ue'))
  if (!m) {
    document.body.textContent = 'matière introuvable'
    return fin()
  }
  const textes = await loadNotesText()
  document.title = `${m.nom} — UE ${m.ue}`

  const sommaire = m.chapitres
    .map((n, i) => `<li><span class="num">${i + 1}</span>${titreChapitre(n)}</li>`)
    .join('')
  const chapitres = m.chapitres
    .map((n, i) => {
      const html = epurerCours(textes[n.id]?.html ?? '')
      return `<section class="chapitre"><p class="sur-titre">Chapitre ${i + 1}</p>${html}</section>`
    })
    .join('')

  document.body.innerHTML = `
    <header class="couverture">
      <p class="sur-titre">UE ${m.ue}</p>
      <h1 class="titre-cours">${m.nom}</h1>
      <p class="date">Tout le cours · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <ol class="sommaire">${sommaire}</ol>
    </header>
    ${chapitres}`

  // Sur papier : les repliables ouverts, les images chargées tout de suite.
  for (const d of document.querySelectorAll('details')) d.setAttribute('open', '')
  for (const img of document.querySelectorAll('img')) {
    img.loading = 'eager'
    // La vignette dérivée suffit à l'écran ; le papier prend l'original.
    const media = img.getAttribute('data-media')
    if (media) {
      img.removeAttribute('srcset')
      img.src = '/media/' + media.split('/').map(encodeURIComponent).join('/')
    }
  }
  await Promise.all(
    [...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))))
  )
  fin()
}

main().catch((e) => {
  document.body.textContent = 'erreur : ' + e
  fin()
})
