#!/usr/bin/env bash
# Issue #41: prove `scripts/wait-for-registry.mjs` reports the real state of
# every registry this repository publishes to.
#
# The C# release job for 0.2.0 went red with "is not on NuGet after publish"
# while the package had in fact been published; this script is the manual
# counter-check. Run it any time a release job disagrees with a registry.
set -u
cd "$(dirname "$0")/.."

probe() {
  echo "--- $1 $2@$3 ---"
  node scripts/wait-for-registry.mjs --registry "$1" --name "$2" --version "$3" \
    --max-attempts 1 --delay-seconds 1 --verbose
  echo "exit: $?"
}

probe nuget  Lino.Objects.Codec  "${NUGET_VERSION:-0.2.0}"
probe pypi   lino-objects-codec  "${PYPI_VERSION:-0.2.0}"
probe crates lino-objects-codec  "${CRATES_VERSION:-0.4.0}"
probe npm    lino-objects-codec  "${NPM_VERSION:-0.5.0}"
