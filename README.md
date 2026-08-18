# brain^2

Le second cerveau en site web — pour se balader visuellement dans le vault Obsidian au lieu de l'ouvrir dossier par dossier.

Le code vit **hors du vault**, conformément à la règle d'architecture du vault (`CLAUDE.md` : « le code ne vit PAS dans le vault »).

---

## Démarrer

```bash
cd ~/Documents/GitHub/vault-gallery
npm install
npm run dev
```

Le site s'ouvre sur <http://localhost:5180>.

`npm run dev` lance l'indexation **puis** le serveur : les données sont donc toujours à jour au démarrage.

---

## Comment c'est lié au vault

```
~/Documents/brain^2/          →   scripts/index-vault.mjs   →   public/vault.json
   (le vault Obsidian)              (lit, parse, copie)          public/media/
                                                                      ↓
                                                                 le site React
```

`scripts/index-vault.mjs` lit le vault et produit un index unique :

- **frontmatter** YAML de chaque note (propriétés affichées dans la colonne de droite) ;
- **markdown rendu en HTML**, avec les `[[wikilinks]]` transformés en liens cliquables et les `![[embeds]]` en images/vidéos ;
- **backlinks** calculés dans les deux sens ;
- **tags**, ceux du frontmatter et ceux posés dans le corps du texte ;
- **projets** — tout dossier `INSPIRATION/<DISCIPLINE>/<slug>/`, `UNIVERS` compris : découpé
  par aspect, avec sa palette, ses tags et les **2-3 tags les plus distinctifs** (`topTags`,
  calculés en écartant les tags de structure et de discipline, puis en gardant les plus rares) ;
- **disciplines** (`INSPIRATION/<DISCIPLINE>/`), y compris les vides — elles font partie de l'architecture ;
- **médias** copiés dans `public/media/` en conservant l'arborescence — **copie
  incrémentale** : seuls les fichiers dont la taille ou la date ont changé sont
  recopiés, et les orphelins sont supprimés ;
- **dérivés web** dans `public/derived/` (voir ci-dessous).

Les liens non résolus (cibles supprimées) ne cassent rien : ils s'affichent en pointillé grisé, comme dans Obsidian.

### Ce qui pèse au premier écran

L'index est coupé en deux. `public/vault.json` (65 Ko gz) porte tout ce qu'un écran
d'accueil ou une grille affiche. Le **HTML rendu des notes et leur texte de recherche**
— 94 Ko gz à eux seuls, pour deux pages — vivent dans `public/vault-notes.json`,
récupéré en tâche de fond une fois la page peinte (`prefetchNotesText`, sur
`requestIdleCallback`) : quand on ouvre une note, il est déjà là.

Le reste tient en quatre points :

- `index.html` **précharge** `/vault.json` : la requête part pendant l'analyse du HTML,
  sans attendre que le bundle soit téléchargé puis exécuté.
- Les **routes sont découpées** (`React.lazy`) : l'entrée ne porte que la coquille et
  l'accueil ; la fiche projet, les notes et la recherche arrivent quand on y va.
- Les tuiles de grille sont en `content-visibility: auto` : hors écran, elles ne sont
  ni peintes ni mises en page.
- `vercel.json` pose les **en-têtes de cache** : `immutable` sur `/assets` (noms hachés),
  un jour + `stale-while-revalidate` sur `/media` et `/derived` (mêmes URL d'une
  indexation à l'autre, donc pas d'`immutable`), revalidation systématique sur l'index.

### Les dérivés d'images — pourquoi le site n'affiche jamais les originaux

Le vault garde les originaux en pleine qualité, c'est sa raison d'être. Mais un PNG
de 11 Mo en 4010 × 8055 posé dans une tuile de 168 px se décode en RAM **à sa taille
native** (~130 Mo de bitmap, pour une vignette). Multiplié par cent tuiles, l'onglet
ne répond plus — c'était l'état du site avant.

`scripts/derivatives.mjs` produit donc, à l'indexation :

| Variante | Taille max | Usage |
| --- | --- | --- |
| `mini` | 400 × 900, q66 | tuiles de grille (168 px, retina compris) |
| `thumb` | 640 × 1400, q72 | planches, grilles larges, couvertures, images des notes |
| `view` | 1800 × 3600, q78 | visionneuse plein écran, et `srcset` retina des notes |
| `preview` | MP4 960 px, CRF 30, faststart | **tout** ce qui est lu dans la page |

Les tuiles sont servies en `srcset` `mini`/`thumb` : le navigateur prend 400 px sur une
petite tuile, 640 px sur un écran retina ou une tuile large. Une fiche de 132 visuels
charge 1,4 Mo de vignettes au lieu de 2,4 Mo — et 180 Mo si on servait les originaux.

- Les **petits SVG ne sont pas touchés** (vectoriels, déjà légers). Au-delà de 40 Ko un
  SVG coûte plus cher qu'un WebP : il est rasterisé comme une image (une texture de
  795 Ko tombe à 33 Ko), l'original restant sous la main.
- Une **vidéo** ne monte plus de `<video>` dans une grille : elle affiche une **image
  d'affiche** extraite par ffmpeg, et le lecteur n'est monté qu'au survol (`preload="none"`).
  Ce lecteur lit le dérivé `preview`, jamais le master : **105 Mo de vidéos → 12 Mo**,
  un teaser de 21 Mo se regarde en 0,7 Mo. Même chose pour les vidéos intégrées aux notes.
- L'original reste accessible depuis la visionneuse, via le lien **original ↗**.
- Tout est **mis en cache** sur (chemin, taille, date) : une réindexation qui ne change
  rien ne recalcule rien (~3 s au lieu de ~65 s).
- `sharp` est une dépendance de dev. S'il manque, l'indexation ne casse pas : elle
  prévient et sert les originaux.

`ffmpeg` doit être sur le `PATH` pour les affiches de vidéos ; sans lui, les vidéos
s'affichent sans image d'affiche et l'indexation le signale.

### Après avoir modifié le vault

```bash
npm run index      # réindexe seul
# ou simplement relancer npm run dev
```

### Navigateur ouvert au démarrage

`.env` fixe `BROWSER=Arc`. Sans cette variable, Vite ne suit pas le navigateur par défaut de macOS : il cherche un Chromium de sa liste interne (Chrome, Edge, Brave, Vivaldi, Chromium) déjà lancé pour y réutiliser un onglet — Arc n'y figure pas, donc le site partait dans Chrome. Pour un autre navigateur, changer cette valeur ; `BROWSER=none` n'ouvre rien.

### Vault situé ailleurs

Le chemin par défaut est `~/Documents/brain^2`. Pour en viser un autre :

```bash
VAULT_PATH="/chemin/vers/le/vault" npm run dev
```

---

## Les pages

| Route | Contenu |
| --- | --- |
| `/` | Vue d'ensemble : compteurs, univers, notes récentes, tags |
| `/projets` | **L'index unique** : inspirations et univers dans la même liste, filtrable par discipline et par tag. Les disciplines encore vides sont listées à part |
| `/projet/:discipline/:slug` | Fiche projet : palette, aspects, galerie, note complète. Les flèches en haut tournent en boucle sur **tous** les projets, dans l'ordre de `/projets` — un univers de référence et un dossier d'inspiration ne sont pas deux choses différentes |
| `/notes` · `/note/*` | Toutes les notes ; lecture avec propriétés, tags, liens sortants et backlinks |
| `/tags` · `/tags/:tag` | Navigation par étiquette |

`/inspirations` et `/univers` redirigent vers `/projets` ; les liens `/univers/<slug>`
déjà partagés tombent sur la fiche correspondante.

Les filtres de `/projets` vivent dans l'URL (`?discipline=UI-DESIGN&tags=crypto,dark`) :
un tri se partage et le bouton retour le défait.

`⌘K` ouvre la recherche (notes, projets, médias, tags). Dans la galerie : clic pour agrandir, flèches pour naviguer, `échap` pour fermer.

---

## App macOS (Tauri)

Le site déployé, dans une fenêtre native — une icône dans le Dock, pas d'onglet de
navigateur. L'app n'embarque **rien** : elle charge l'URL de production, donc un
déploiement Vercel suffit à la mettre à jour, sans recompilation ni réinstallation.
Tauri utilise le WebView du système (WKWebView), d'où un binaire de 12 Mo.

```bash
npm run tauri:dev      # ouvre la fenêtre sur le site en ligne
npm run tauri:build    # compile l'app (≈ 1 min, les dépendances Rust étant en cache)
npm run tauri:dmg      # emballe le .app compilé dans un .dmg distribuable
```

Les livrables sortent dans :

```
src-tauri/target/release/bundle/macos/brain^2.app
src-tauri/target/release/bundle/dmg/brain^2_1.0.0_x64.dmg
```

Installation : ouvrir le `.dmg` et glisser l'app sur le raccourci *Applications*, ou

```bash
cp -R "src-tauri/target/release/bundle/macos/brain^2.app" /Applications/
```

### Wrapper de site distant

`build.frontendDist` **et** `build.devUrl` pointent tous les deux sur l'URL de
production ; il n'y a ni `beforeBuildCommand`, ni export statique, ni bundle du front.
`app.security.csp` reste `null` : la page est distante, c'est le serveur qui décide
sa politique.

Point critique : une page distante n'a **aucun droit** d'appeler les API Tauri tant que
son origine n'est pas déclarée dans `src-tauri/capabilities/default.json` sous la clé
`remote`, sous ses deux formes (l'URL nue et l'URL suivie de `/*`). Sans ça, les appels
échouent en silence. Aucun plugin n'est installé aujourd'hui, mais la déclaration est
en place.

### Pourquoi le .dmg est fait à part

Le `bundle_dmg.sh` de Tauri place les icônes dans la fenêtre du montage en pilotant le
**Finder via AppleScript** — il échoue tant que le terminal n'a pas l'autorisation
*Automatisation*. La cible `dmg` est donc retirée de `tauri.conf.json`
(`bundle.targets: ["app"]`) et `scripts/make-dmg.sh` fabrique l'image avec `hdiutil` :
même résultat (app + raccourci vers `/Applications`), sans dépendre du Finder.

### Prérequis

Rust (une fois pour toutes) : `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`,
plus les Command Line Tools d'Xcode.

### Ce qu'il faut savoir

- **L'app suit le site.** Le contenu affiché est celui du dernier déploiement Vercel :
  pas de rebuild après une mise à jour du vault, mais pas de fonctionnement hors ligne
  non plus.
- **Le site doit rester public.** Si la protection de déploiement de Vercel est
  réactivée, l'app n'affichera qu'un écran de connexion.
- **L'app n'est pas signée** ni notariée. Compilée localement elle s'ouvre sans
  avertissement ; distribuée à un autre Mac, il faut faire clic droit → *Ouvrir*.
- **Windows et Linux ne se compilent pas depuis macOS.** Tauri ne croise pas les
  compilations : il faut un runner par plateforme (GitHub Actions), ou compiler sur la
  machine cible.
- **Icône** : générée depuis `public/favicon.svg`, posée au gabarit Apple (la forme
  occupe 824 px dans un canevas de 1024, le reste transparent — sans cette marge,
  l'icône paraît plus grosse que les autres dans le Dock). Tous les formats sont dans
  `src-tauri/icons/`.

La config vit dans `src-tauri/tauri.conf.json` (nom, identifiant
`design.sacha.brain2.live`, URL de production, taille de fenêtre, cibles du bundle).

---

## Déployer sur Vercel

Vercel n'a évidemment pas accès au vault local. Le site déployé consomme donc l'index **commité dans le repo** — c'est pourquoi `vercel.json` lance `vite build` seul, sans réindexer.

```bash
npm run index                     # régénère l'index depuis le vault local
git add -A && git commit -m "maj du vault"
git push                          # Vercel redéploie
```

`public/vault.json` et `public/media/` doivent donc rester **versionnés** (≈ 6,5 Mo aujourd'hui). Si le vault grossit beaucoup, deux options : ne publier qu'une partie des dossiers, ou passer les médias sur un stockage externe.

Le `rewrites` de `vercel.json` renvoie toutes les routes vers `index.html`, sans quoi un rechargement sur `/inspirations` renverrait un 404.

---

## Stack

Vite · React 19 · React Router 7 · Tailwind v4 · `gray-matter` (frontmatter) · `marked` (markdown).

Design repris des tokens de `sordulo-gallery` : DM Sans, bleu nuit `#00082e`, fond blanc, échelle typographique très resserrée (display 43px / `-1.72px`, label 14px / `-0.7px`, caption 11px / `-0.3px`).
