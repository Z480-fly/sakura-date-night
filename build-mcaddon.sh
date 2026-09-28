#!/bin/sh
# Package both packs into one importable .mcaddon.
# The zip must have manifest.json at pack-folder top level, so run from the repo root.
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/sakura-date-night.mcaddon
zip -r -q dist/sakura-date-night.mcaddon behavior_pack resource_pack \
  -x '*.DS_Store' -x '__MACOSX/*'
echo "built dist/sakura-date-night.mcaddon"
unzip -l dist/sakura-date-night.mcaddon | grep -c manifest.json
