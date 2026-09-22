import katex from 'katex'
import { useMemo } from 'react'

/*
 * Le texte des annales porte des formules : $f'(x)$, des matrices, des sommes.
 * Les fiches du vault passent par l'indexeur, qui rend leur LaTeX à la
 * construction (voir scripts/markdown.mjs) ; les annales, elles, sont servies
 * comme données brutes, donc le rendu se fait ici, au moment de l'affichage.
 * Même bibliothèque, même feuille de style — juste de l'autre côté.
 */

const rendre = (tex: string, bloc: boolean) => {
  try {
    return katex.renderToString(tex, { displayMode: bloc, throwOnError: false, strict: false })
  } catch {
    return tex
  }
}

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Un texte mêlant prose et formules `$…$`. Ce qui n'est pas entre dollars reste
 * du texte, échappé : rien de ce que porte l'annale n'est interprété en HTML.
 */
export function Maths({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => {
    const out: string[] = []
    // `$$…$$` en bloc, `$…$` en ligne. Le découpage garde les séparateurs.
    for (const part of children.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g)) {
      if (part.startsWith('$$') && part.endsWith('$$')) out.push(rendre(part.slice(2, -2), true))
      else if (part.startsWith('$') && part.endsWith('$') && part.length > 2)
        out.push(rendre(part.slice(1, -1), false))
      else out.push(echapper(part))
    }
    return out.join('')
  }, [children])

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
