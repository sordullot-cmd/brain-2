import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DockProvider } from './components/Dock'
import { Home } from './pages/Home'
import { loadVault, prefetchNotesText, type VaultData } from './lib/vault'

/*
 * Seuls l'accueil et la coquille sont dans le bundle d'entrée. La fiche projet
 * traîne toute la mise en page « charte » (Spec, 400 lignes), les notes leur
 * rendu, la recherche son index : rien de tout ça n'est utile pour peindre le
 * premier écran, donc rien de tout ça n'est téléchargé avant qu'on y aille.
 */
const Projets = lazy(() => import('./pages/Projets').then((m) => ({ default: m.Projets })))
const ProjetDetail = lazy(() => import('./pages/Projet').then((m) => ({ default: m.ProjetDetail })))
const NotesList = lazy(() => import('./pages/Notes').then((m) => ({ default: m.NotesList })))
const NoteView = lazy(() => import('./pages/Notes').then((m) => ({ default: m.NoteView })))
const TagsList = lazy(() => import('./pages/Notes').then((m) => ({ default: m.TagsList })))
const TagView = lazy(() => import('./pages/Notes').then((m) => ({ default: m.TagView })))
const Search = lazy(() => import('./components/Search').then((m) => ({ default: m.Search })))

export default function App() {
  const [data, setData] = useState<VaultData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState(false)

  useEffect(() => {
    loadVault().then(setData).catch((e) => setErr(String(e.message ?? e)))
  }, [])

  // Le texte des notes (HTML rendu + index de recherche) vit dans un second
  // fichier. On le tire une fois la page peinte : la navigation le trouve déjà
  // là, sans qu'il ait pesé sur le premier écran.
  useEffect(() => {
    if (!data) return
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1200))
    const id = idle(() => prefetchNotesText())
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number)
  }, [data])

  // ⌘K / Ctrl+K ouvre la recherche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (err)
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md">
          <h1 className="display-md mb-4">Index introuvable</h1>
          <p className="text-[14px] text-muted leading-relaxed mb-5">{err}</p>
          <p className="caption text-subtle mono bg-surface rounded-lg p-4 leading-relaxed">npm run index</p>
        </div>
      </div>
    )

  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="caption text-subtle animate-pulse">Chargement du vault…</div>
      </div>
    )

  return (
    <BrowserRouter>
      {/* La barre flottante (flèches projet, retour en haut) est rendue par le
          Layout ; les pages y déposent leurs flèches via `useDockPager`. */}
      <DockProvider>
        <Layout data={data} onSearch={() => setSearch(true)}>
          <Suspense fallback={<div className="caption text-subtle p-8 animate-pulse">Chargement…</div>}>
            <Routes>
              <Route path="/" element={<Home data={data} />} />
              <Route path="/projets" element={<Projets data={data} />} />
              <Route path="/projet/:discipline/:slug" element={<ProjetDetail data={data} />} />
              {/* Anciennes routes : /inspirations et /univers ont fusionné en /projets. */}
              <Route path="/inspirations" element={<Navigate to="/projets" replace />} />
              <Route path="/univers" element={<Navigate to="/projets" replace />} />
              <Route path="/univers/:slug" element={<LegacyUnivers />} />
              <Route path="/notes" element={<NotesList data={data} />} />
              <Route path="/note/*" element={<NoteView data={data} />} />
              <Route path="/tags" element={<TagsList data={data} />} />
              <Route path="/tags/:tag" element={<TagView data={data} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </DockProvider>
      {search && (
        <Suspense fallback={null}>
          <Search data={data} onClose={() => setSearch(false)} />
        </Suspense>
      )}
    </BrowserRouter>
  )
}

/** Les liens /univers/<slug> déjà partagés continuent de tomber au bon endroit. */
function LegacyUnivers() {
  const { slug } = useParams()
  return <Navigate to={`/projet/UNIVERS/${slug}`} replace />
}
