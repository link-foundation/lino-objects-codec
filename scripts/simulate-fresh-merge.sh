#!/usr/bin/env bash
# simulate-fresh-merge.sh
#
# Simulates a fresh merge of the current pull-request branch with the latest
# base branch, so CI validates the state that will actually land on the base
# branch instead of a stale merge preview.
#
# GitHub builds `refs/pull/N/merge` when a pull request is opened or synced.
# If the base branch moves afterwards, that preview is out of date: checks can
# pass against code that no longer merges cleanly, or fail against a conflict
# that has already been resolved upstream. This is CI/CD best practice #7,
# "Validate the Actual Merge Result".
#
# Usage:
#   BASE_REF=main bash scripts/simulate-fresh-merge.sh
#
# Environment variables:
#   BASE_REF  The base branch to merge with (for example "main"). Required.
#   VERBOSE   Set to "1" to echo the commits that the base branch is ahead by.
#
# Exit code 0 = merge succeeded or was not needed; 1 = merge conflict.

set -euo pipefail

if [ -z "${BASE_REF:-}" ]; then
  echo "::error::BASE_REF is not set; cannot simulate a merge."
  exit 1
fi

echo "=== Synchronizing with the latest $BASE_REF ==="

# A local identity is required for `git merge` to record a merge commit.
git config user.email "github-actions[bot]@users.noreply.github.com"
git config user.name "github-actions[bot]"

git fetch origin "$BASE_REF"

echo "Current checkout (merge preview): $(git rev-parse HEAD)"
echo "Latest base branch ($BASE_REF):   $(git rev-parse "origin/$BASE_REF")"

BEHIND_COUNT=$(git rev-list --count "HEAD..origin/$BASE_REF")

if [ "$BEHIND_COUNT" -eq 0 ]; then
  echo "Merge preview is up to date with $BASE_REF; no simulation needed."
  exit 0
fi

echo "Base branch has $BEHIND_COUNT new commit(s) since this run was queued."

# Off by default: the commit list is only useful while debugging a surprising
# merge result, and it makes every ordinary run noisier.
if [ "${VERBOSE:-0}" = "1" ]; then
  echo "--- commits only on origin/$BASE_REF ---"
  git log --oneline "HEAD..origin/$BASE_REF"
  echo "---------------------------------------"
fi

echo "Simulating a fresh merge to validate the real merge result..."

if git merge "origin/$BASE_REF" --no-edit; then
  echo "Fresh merge simulation successful; checks run against the merged state."
else
  echo "::error::Merge conflict detected. This pull request must be updated \
with $BASE_REF before it can be merged."
  exit 1
fi
