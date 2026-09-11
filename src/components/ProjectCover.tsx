import { displaySrc, type Media, type Project } from '../lib/vault'

/**
 * La vignette de couverture d'un projet — le cadre 4/3 de l'index et de
 * l'accueil, au même rendu des deux côtés.
 *
 * L'image est l'identité de la marque — presque toujours l'icône de l'app, le
 * même matériau d'un projet à l'autre, pour que l'index se lise comme une série
 * (voir `pickCover` dans `scripts/index-vault.mjs`). Elle se pose donc en
 * entier sur le fond : la recadrer la décapiterait. `cover` ne sert qu'au
 * visuel de repli d'un dossier sans marque à lui.
 */
export function ProjectCover({ p, cover }: { p: Project; cover: Media | null }) {
  const plein = p.coverFit === 'cover'

  return (
    <div
      className={`aspect-[4/3] rounded-2xl bg-surface overflow-hidden flex items-center justify-center ${
        plein ? '' : 'p-8 sm:p-10'
      }`}
    >
      {cover && cover.kind === 'image' ? (
        <img
          src={displaySrc(cover, 'thumb')}
          alt={p.title}
          width={cover.dw}
          height={cover.dh}
          loading="lazy"
          decoding="async"
          className={`transition-transform duration-500 group-hover:scale-[1.05] ${
            plein ? 'h-full w-full object-cover' : 'max-h-full max-w-full object-contain'
          }`}
        />
      ) : (
        <span className="caption text-subtle">aucun visuel</span>
      )}
    </div>
  )
}
