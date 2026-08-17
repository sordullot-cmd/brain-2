#!/usr/bin/env bash
#
# Fabrique le .dmg à partir du .app déjà compilé par `npm run app:build`.
#
# Tauri sait le faire seul, mais son bundle_dmg.sh pilote le Finder en AppleScript
# (pour placer les icônes dans la fenêtre) et échoue si l'autorisation
# « Automatisation » n'est pas accordée au terminal. hdiutil suffit : on obtient
# une image montable avec l'app et un raccourci vers /Applications.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/src-tauri/target/release/bundle"
APP="$BUNDLE/macos/brain^2.app"
VERSION="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version")"
OUT="$BUNDLE/dmg/brain^2_${VERSION}_x64.dmg"

if [ ! -d "$APP" ]; then
  echo "brain^2.app introuvable — lance d'abord : npm run app:build" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

mkdir -p "$BUNDLE/dmg"
hdiutil create -volname "brain^2" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null

echo "-> $OUT"
