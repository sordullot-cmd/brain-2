import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Search } from './components/Search'
import { Home } from './pages/Home'
import { Inspirations } from './pages/Inspirations'
import { UniversList, UniversDetail } from './pages/Univers'
import { NotesList, NoteView, TagsList, TagView } from './pages/Notes'
import { loadVault, type VaultData } from './lib/vault'

export default function App() {
  const [data, setData] = useState<VaultData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState(false)

  useEffect(() => {
    loadVault().then(setData).catch((e) => setErr(String(e.message ?? e)))
  }, [])

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
      <Layout data={data} onSearch={() => setSearch(true)}>
        <Routes>
          <Route path="/" element={<Home data={data} />} />
          <Route path="/inspirations" element={<Inspirations data={data} />} />
          <Route path="/univers" element={<UniversList data={data} />} />
          <Route path="/univers/:slug" element={<UniversDetail data={data} />} />
          <Route path="/notes" element={<NotesList data={data} />} />
          <Route path="/note/*" element={<NoteView data={data} />} />
          <Route path="/tags" element={<TagsList data={data} />} />
          <Route path="/tags/:tag" element={<TagView data={data} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      {search && <Search data={data} onClose={() => setSearch(false)} />}
    </BrowserRouter>
  )
}
