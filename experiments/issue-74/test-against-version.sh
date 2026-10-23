#!/usr/bin/env bash
# Run all four test suites against one links-notation release (issue #74).
#
# The working tree (tracked and new files, without ignored build output) is
# copied to a scratch directory, where each package's links-notation
# requirement is rewritten to exactly the given version, so the real working
# tree is never touched. Usage:
#
#   experiments/issue-74/test-against-version.sh 0.26.0 [rust js python csharp]
#
# Needs cargo, node/npm, python3 (>=3.13) and dotnet on PATH. Prints one
# PASS/FAIL line per language and exits non-zero if any suite failed.
set -uo pipefail

VERSION="${1:?usage: $0 <links-notation version> [languages...]}"
shift
if [ "$#" -gt 0 ]; then LANGS=("$@"); else LANGS=(rust js python csharp); fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STATUS=0
# The suites also read fixtures/, experiments/ and .github/, so copy it all.
git -C "$ROOT" ls-files -z --cached --others --exclude-standard \
  | (cd "$ROOT" && tar --null -T - -cf -) | tar -xf - -C "$WORK"

report() { # <lang> <exit code> <log>
  # Keep the log after the scratch directory is removed.
  local kept="${TMPDIR:-/tmp}/issue-74-$1-$VERSION.log"
  cp "$3" "$kept"
  if [ "$2" -eq 0 ]; then
    echo "PASS $1 links-notation $VERSION"
  else
    echo "FAIL $1 links-notation $VERSION (log: $kept)"
    STATUS=1
  fi
}

for lang in "${LANGS[@]}"; do
  log="$WORK/$lang.log"
  case "$lang" in
    rust)
      sed -i "s/^links-notation = \"[^\"]*\"/links-notation = \"=$VERSION\"/" "$WORK/rust/Cargo.toml"
      (cd "$WORK/rust" && cargo update -p links-notation && cargo test --all-features) > "$log" 2>&1
      report rust $? "$log"
      ;;
    js)
      (cd "$WORK/js" && npm ci --ignore-scripts \
        && npm install --save-exact --ignore-scripts "links-notation@$VERSION" \
        && npm ls links-notation && npm test) > "$log" 2>&1
      report js $? "$log"
      ;;
    python)
      sed -i "s/\"links-notation[^\"]*\"/\"links-notation==$VERSION\"/" "$WORK/python/pyproject.toml"
      (cd "$WORK/python" && python3 -m venv .venv \
        && .venv/bin/pip install -q -e ".[dev]" \
        && .venv/bin/pip show links-notation \
        && .venv/bin/python -m pytest -q -p no:cacheprovider tests) > "$log" 2>&1
      report python $? "$log"
      ;;
    csharp)
      sed -i "s/Include=\"Link.Foundation.Links.Notation\" Version=\"[^\"]*\"/Include=\"Link.Foundation.Links.Notation\" Version=\"[$VERSION]\"/" \
        "$WORK/csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj"
      (cd "$WORK/csharp" && dotnet test --configuration Release) > "$log" 2>&1
      report csharp $? "$log"
      ;;
    *)
      echo "unknown language: $lang" >&2
      STATUS=2
      ;;
  esac
done

exit "$STATUS"
