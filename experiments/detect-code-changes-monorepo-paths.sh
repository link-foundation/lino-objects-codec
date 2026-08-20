#!/usr/bin/env bash
# Reproduces the monorepo path bug in `js/scripts/detect-code-changes.mjs` and
# `rust/scripts/detect-code-changes.mjs` (same class as issue #39).
#
# `git diff --name-only` prints paths relative to the *repository root*, but the
# workflow runs the script with `working-directory: ./js`, and the script
# compares those paths against package-relative prefixes such as `examples/` and
# against the exact string `package.json`. In a monorepo the real paths are
# `js/examples/...` and `js/package.json`, so:
#
#   * `examples/`, `experiments/`, `docs/` and `.changeset/` are never excluded
#     -> an examples-only pull request is reported as a code change and is asked
#        for a changeset it does not need (false positive);
#   * `package-changed` can never be true (false negative).
#
# Usage: bash experiments/detect-code-changes-monorepo-paths.sh [path-to-script]
set -euo pipefail

SCRIPT="${1:-$(cd "$(dirname "$0")/.." && pwd)/js/scripts/detect-code-changes.mjs}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
git init -q .
git config user.email ci@example.com
git config user.name CI

mkdir -p js/scripts js/examples
cp "$SCRIPT" js/scripts/detect-code-changes.mjs
echo '{}' > js/package.json
git add -A
git commit -qm "base"
BASE="$(git rev-parse HEAD)"

# A pull request that only touches an example. By the script's own documentation
# this is excluded from "code changes".
echo "// demo" > js/examples/demo.mjs
git add -A
git commit -qm "docs: add an example"
HEAD_SHA="$(git rev-parse HEAD)"

cd js
echo "--- detect-code-changes.mjs on an examples-only pull request ---"
GITHUB_EVENT_NAME=pull_request GITHUB_BASE_SHA="$BASE" GITHUB_HEAD_SHA="$HEAD_SHA" \
  node scripts/detect-code-changes.mjs
