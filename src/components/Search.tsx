import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COURS_DOMAIN, contentNotes, norm, type VaultData } from '../lib/vault'

type Hit = { kind: 'Projet' | 'Dossier'; title: string; sub: string; to: string; score: number }

/**
 * Les dossiers de notes du vault, agrégés depuis le chemin des .md : chaque
 * segment compte les notes qu'il contient, sous-dossiers compris (« eco
 * gestion » vaut donc « eco gestion » + « eco gestion/_brut »).
 *
 * Le chemin d'un projet n'en devient pas une : le projet est déjà listé comme
 * tel. Les autres mènent là où leurs notes se lisent vraiment — l'index des
 * projets filtré pour une discipline, la page des cours pour « eco gestion »,
 * la liste des notes filtrée pour le reste.
 */
function folders(data: VaultData) {
  const projet = new Set(data.projects.map((p) => `INSPIRATION/${p.discipline}/${p.slug}`))
  const discipline = new Map(data.disciplines.map((d) => [d.path, d.name]))

  const count = new Map<string, number>()
  for (const n of contentNotes(data)) {
    const parts = n.folder.split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/')
      count.set(path, (count.get(path) ?? 0) + 1)
    }
  }

  return [...count.entries()]
    .filter(([path]) => !projet.has(path))
    .map(([path, n]) => ({
      path,
      name: path.split('/').pop()!,
      n,
      to: discipline.has(path)
        ? `/projets?discipline=${encodeURIComponent(discipline.get(path)!)}`
        : path === COURS_DOMAIN || path.startsWith(`${COURS_DOMAIN}/`)
          ? '/cours'
          : // Le filtre de /notes porte sur le titre ET le chemin : le slug final
            // vise le chemin seul, sinon « notes » ramènerait toute note dont le
            // titre contient ce mot.
            `/notes?q=${encodeURIComponent(`${path}/`)}`,
    }))
}

/**
 * Palette de recherche (⌘K). Elle ne vise que les deux entrées où l'on range
 * quelque chose — les projets et les dossiers de notes ; les notes, médias et
 * tags se trouvent depuis leur propre page.
 */
export function Search({ data, onClose }: { data: VaultData; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const dossiers = useMemo(() => folders(data), [data])

  useEffect(() => {
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const term = norm(q.trim())
    if (term.length < 2) return []
    const out: Hit[] = []

    for (const u of data.projects) {
      if (norm(u.title + ' ' + u.slug).includes(term))
        out.push({
          kind: 'Projet',
          title: u.title,
          sub: `${u.disciplineLabel} · ${u.count} médias`,
          to: `/projet/${u.discipline}/${u.slug}`,
          score: 0,
        })
    }
    for (const d of dossiers) {
      // Le nom du dossier d'abord, son chemin ensuite : taper « notes » remonte
      // « notes » avant « notes/conflicts ».
      const inName = norm(d.name).includes(term)
      if (!inName && !norm(d.path).includes(term)) continue
      out.push({
        kind: 'Dossier',
        title: d.name,
        sub: `${d.path} · ${d.n} note${d.n > 1 ? 's' : ''}`,
        to: d.to,
        score: inName ? 1 : 2,
      })
    }

    return out.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, 'fr')).slice(0, 40)
  }, [q, data, dossiers])

  useEffect(() => setSel(0), [q])

  const go = (h: Hit) => {
    navigate(h.to)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-brand/25 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-background rounded-2xl border border-border shadow-[0_24px_70px_-24px_rgba(0,8,46,0.5)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 h-14 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-subtle shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, hits.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              }
              if (e.key === 'Enter' && hits[sel]) go(hits[sel])
            }}
            placeholder="Chercher un projet ou un dossier…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-subtle/60"
          />
          <kbd className="caption px-1.5 py-1 rounded bg-surface-strong text-subtle mono shrink-0">esc</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="caption text-subtle px-5 py-8 text-center">Tape au moins deux caractères.</p>
          ) : hits.length === 0 ? (
            <p className="caption text-subtle px-5 py-8 text-center">Aucun résultat pour « {q} ».</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.to + i}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(h)}
                className={`w-full text-left px-5 py-3 flex items-center gap-4 transition-colors ${
                  i === sel ? 'bg-surface' : ''
                }`}
              >
                <span className="caption uppercase text-subtle w-16 shrink-0">{h.kind}</span>
                <span className="label truncate flex-1">{h.title}</span>
                <span className="caption text-subtle truncate max-w-[35%] mono">{h.sub}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
