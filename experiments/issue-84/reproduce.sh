#!/usr/bin/env bash
# Issue #84 reproduction: which links-notation does a consumer of the published
# lino-objects-codec get, and does it match the repository's Cargo.toml?
#
#   bash experiments/issue-84/reproduce.sh            # checks 0.9.3 (the issue)
#   bash experiments/issue-84/reproduce.sh 0.9.4      # checks a later release
#
# Exit code 0: the registry artifact matches rust/Cargo.toml.
# Exit code 1: it does not (expected for 0.9.3, which requires ^0.27.1).
set -euo pipefail
VERSION="${1:-0.9.3}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/rust"
node scripts/verify-published-crate.mjs --version "$VERSION" --consumer --max-attempts 1
