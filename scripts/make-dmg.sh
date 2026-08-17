#!/usr/bin/env bash
#
# Fabrique le .dmg à partir d'un .app déjà compilé.
#
#   bash scripts/make-dmg.sh                        # app hors ligne  (brain^2)
#   bash scripts/make-dmg.sh "brain^2 Live" tauri.web.conf.json
#
# Tauri sait le faire seul, mais son bundle_dmg.sh pilote le Finder en AppleScript
# (pour placer les icônes dans la fenêtre) et échoue si l'autorisation
# « Automatisation » n'est pas accordée au terminal. hdiutil suffit : on obtient
# une image montable avec l'app et un raccourci vers /Applications.
#
set -euo pipefail

NAME="${1:-brain^2}"
CONF="${2:-tauri.conf.json}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/src-tauri/target/release/bundle"
APP="$BUNDLE/macos/$NAME.app"
VERSION="$(node -p "require('$ROOT/src-tauri/$CONF').version")"
SLUG="$(echo "$NAME" | tr ' ' '_')"
OUT="$BUNDLE/dmg/${SLUG}_${VERSION}_x64.dmg"

if [ ! -d "$APP" ]; then
  echo "$NAME.app introuvable — lance d'abord le build correspondant." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

mkdir -p "$BUNDLE/dmg"
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null

echo "-> $OUT"
