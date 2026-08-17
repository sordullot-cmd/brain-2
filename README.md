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
- **univers** (`INSPIRATION/UNIVERS/<slug>/`) découpés par aspect, avec leur palette ;
- **disciplines** (`INSPIRATION/<DISCIPLINE>/`), y compris les vides — elles font partie de l'architecture ;
- **médias** copiés dans `public/media/` en conservant l'arborescence.

Les liens non résolus (cibles supprimées) ne cassent rien : ils s'affichent en pointillé grisé, comme dans Obsidian.

### Après avoir modifié le vault

```bash
npm run index      # réindexe seul
# ou simplement relancer npm run dev
```

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
| `/inspirations` | Les disciplines et leur contenu ; les disciplines vides sont listées à part |
| `/univers` · `/univers/:slug` | Dossiers de référence : palette, filtres par aspect, galerie, fiche complète |
| `/notes` · `/note/*` | Toutes les notes ; lecture avec propriétés, tags, liens sortants et backlinks |
| `/tags` · `/tags/:tag` | Navigation par étiquette |

`⌘K` ouvre la recherche (notes, univers, médias, tags). Dans la galerie : clic pour agrandir, flèches pour naviguer, `échap` pour fermer.

---

## App macOS (Tauri)

Le même site, empaqueté en application native — une fenêtre à part, une icône dans le Dock, pas d'onglet de navigateur. Tauri utilise le WebView du système (WKWebView) : pas de Chromium embarqué, donc un binaire léger.

```bash
npm run app          # lance l'app en dev (réindexe, démarre Vite, ouvre la fenêtre)
npm run app:build    # compile l'app (≈ 6 min la première fois, quelques secondes ensuite)
npm run app:dmg      # emballe le .app compilé dans un .dmg distribuable
```

Les livrables sortent dans :

```
src-tauri/target/release/bundle/macos/brain^2.app
src-tauri/target/release/bundle/dmg/brain^2_1.0.0_x64.dmg
```

Installation : `cp -R src-tauri/target/release/bundle/macos/brain^2.app /Applications/`.

### Pourquoi le .dmg est fait à part

Le `bundle_dmg.sh` de Tauri place les icônes dans la fenêtre du montage en pilotant le **Finder via AppleScript** — il échoue tant que le terminal n'a pas l'autorisation *Automatisation*. La cible `dmg` est donc retirée de `tauri.conf.json` (`bundle.targets: ["app"]`) et `scripts/make-dmg.sh` fabrique l'image avec `hdiutil` : même résultat (app + raccourci vers `/Applications`), sans dépendre du Finder.

### Prérequis

Rust (une fois pour toutes) : `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`, plus les Command Line Tools d'Xcode.

### Ce qu'il faut savoir

- **Les données sont figées au build.** `npm run app:build` réindexe le vault et embarque le résultat dans l'app : le contenu affiché est celui du vault au moment de la compilation. Après avoir modifié le vault, relancer `npm run app:build` (ou travailler avec `npm run app`, qui réindexe à chaque démarrage).
- **L'app est volumineuse** — elle contient les médias copiés depuis le vault (≈ 200 Mo aujourd'hui).
- **DM Sans est embarquée** (`@fontsource-variable/dm-sans`, importée dans `src/index.css`) : l'app ne dépend pas de Google Fonts et fonctionne hors ligne.
- **L'app n'est pas signée** ni notariée. Au premier lancement, macOS affiche un avertissement : clic droit → *Ouvrir*, ou Réglages Système → Confidentialité et sécurité → *Ouvrir quand même*. Une signature demanderait un compte Apple Developer.
- **Icône** : générée depuis `public/lofo.svg` (`npx tauri icon <png 1024×1024 RGBA>`), tous les formats sont dans `src-tauri/icons/`.

La config vit dans `src-tauri/tauri.conf.json` (nom, identifiant `design.sacha.brain2`, taille de fenêtre, cibles du bundle).

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
