#!/usr/bin/env bash
# From the repo root, pass an absolute .NET 11 dotnet path if it is not on PATH.
# Reproduce CodeQL's targeting-pack substitution, then verify the real locked build.
set -euo pipefail
cli="${1:-dotnet}"
project=csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj
scratch=$(mktemp -d "$PWD/experiments/issue-86/codeql-restore.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
if "$cli" restore "$project" --no-dependencies \
  /p:DisableImplicitNuGetFallbackFolder=true \
  "/p:TargetFrameworkRootPath=$scratch" \
  "/p:NetCoreTargetingPackRoot=$scratch" \
  /p:AllowMissingPrunePackageData=true; then
  echo 'CodeQL-style restore unexpectedly succeeded: re-evaluate the workaround.'
  exit 1
fi
"$cli" restore "$project" --locked-mode
"$cli" build "$project" --no-restore --configuration Release --no-incremental \
  -p:UseSharedCompilation=false
