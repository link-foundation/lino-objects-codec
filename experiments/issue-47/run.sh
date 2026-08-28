#!/usr/bin/env bash
# Cross-implementation round trip at links-notation 0.16.1 (issue #47).
#
# Every implementation writes the same record, then every implementation reads
# every document. Sixteen re-encodings; they must all be the same string.
set -euo pipefail

# `links-notation` must be importable; point PYTHON at the virtualenv that has it.
PYTHON="${PYTHON:-python3}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/out"
rm -rf "$out" && mkdir -p "$out"

echo "--- writing ---"
node "$here/interop.mjs" write "$out/js.lino"
"$PYTHON" "$here/interop.py" write "$out/python.lino"
cargo run --quiet --manifest-path "$here/rust-interop/Cargo.toml" -- write "$out/rust.lino"
dotnet run --project "$here/csharp-interop" --verbosity quiet -- write "$out/csharp.lino"
for f in "$out"/*.lino; do echo "  $(basename "$f"): $(cat "$f")"; done

echo "--- reading ---"
{
  node "$here/interop.mjs" read "$out"
  "$PYTHON" "$here/interop.py" read "$out"
  cargo run --quiet --manifest-path "$here/rust-interop/Cargo.toml" -- read "$out"
  dotnet run --project "$here/csharp-interop" --verbosity quiet -- read "$out"
} | tee "$out/readings.txt"

echo "--- comparing ---"
distinct=$(sed 's/^[a-z]* reading [^ ]*: //' "$out/readings.txt" | sort -u)
count=$(printf '%s\n' "$distinct" | wc -l)
readings=$(wc -l < "$out/readings.txt")
if [ "$count" -eq 1 ]; then
  echo "PASS: all $readings readings agree on:"
  echo "  $distinct"
else
  echo "FAIL: $readings readings produced $count distinct values:"
  printf '%s\n' "$distinct" | sed 's/^/  /'
  exit 1
fi
