#!/usr/bin/env bash
# Reproduce issue #74 from a consumer's point of view: install the packed
# lino-objects-codec next to the latest links-notation and list the parser
# copies. Before the fix (published 0.9.2) npm nests a second links-notation
# 0.25.2 under lino-objects-codec; after it, one deduped copy remains.
#
#   experiments/issue-74/dedupe-check.sh [links-notation version] [codec spec]
#
# codec spec defaults to a tarball packed from this working tree's js/; pass
# e.g. lino-objects-codec@0.9.2 to see the published (pre-fix) behaviour.
set -euo pipefail
VERSION="${1:-0.27.1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if [ "$#" -ge 2 ]; then
  CODEC="$2"
else
  CODEC="$WORK/$(cd "$ROOT/js" && npm pack --silent --ignore-scripts --pack-destination "$WORK" | tail -1)"
fi
cd "$WORK"
npm init -y >/dev/null
npm install --silent --ignore-scripts "$CODEC" "links-notation@$VERSION" >/dev/null
npm ls links-notation
COPIES=$(npm ls links-notation --all --parseable | grep -c 'node_modules/.*links-notation$' || true)
echo "links-notation copies installed: $COPIES"
[ "$COPIES" -eq 1 ]
