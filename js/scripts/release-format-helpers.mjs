/**
 * Helpers for formatting release titles, tags, and shields.io badges.
 *
 * Tag prefix convention (per issue #33):
 *   js_v / rust_v / python_v / csharp_v
 * Title convention:
 *   "[JavaScript] X.Y.Z" / "[Rust] X.Y.Z" / "[Python] X.Y.Z" / "[C#] X.Y.Z"
 *
 * normalizeReleaseVersionForBadge strips any language prefix ("js-",
 * "rust-", "python-", "csharp-", or a leading "v") so the badge always shows
 * the bare semver, even if the caller passes "js-v0.3.5". The previous code
 * used `replace(/^v/, '')` which left the language prefix in place,
 * producing badges like `npm-js-v0.3.5` and broken npm links.
 */

export function normalizeReleaseVersionForBadge(releaseVersion) {
  const trimmedVersion = String(releaseVersion ?? '').trim();
  const semverTagMatch = trimmedVersion.match(
    /(?:^|[-_])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/i
  );

  if (semverTagMatch) {
    return semverTagMatch[1];
  }

  return trimmedVersion
    .replace(/^[A-Za-z][A-Za-z0-9]*[-_]/, '')
    .replace(/^v/i, '');
}

export function encodeShieldsStaticBadgeSegment(value) {
  return encodeURIComponent(value).replace(/-/g, '--').replace(/_/g, '__');
}

export function buildNpmVersionBadge(packageName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const packageVersionPath = encodeURIComponent(versionWithoutV);

  return `[![npm version](https://img.shields.io/badge/npm-${badgeVersion}-blue.svg)](https://www.npmjs.com/package/${packageName}/v/${packageVersionPath})`;
}

export function buildCratesIoVersionBadge(crateName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const crateVersionPath = encodeURIComponent(versionWithoutV);

  return `[![crates.io](https://img.shields.io/badge/crates.io-${badgeVersion}-orange.svg)](https://crates.io/crates/${crateName}/${crateVersionPath})`;
}

export function buildNuGetVersionBadge(packageName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const packageVersionPath = encodeURIComponent(versionWithoutV);

  return `[![NuGet](https://img.shields.io/badge/nuget-${badgeVersion}-blue.svg)](https://www.nuget.org/packages/${packageName}/${packageVersionPath})`;
}

export function buildPyPiVersionBadge(packageName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const packageVersionPath = encodeURIComponent(versionWithoutV);

  return `[![PyPI](https://img.shields.io/badge/pypi-${badgeVersion}-blue.svg)](https://pypi.org/project/${packageName}/${packageVersionPath}/)`;
}

/**
 * Build the human-readable release title. Examples:
 *   buildReleaseTitle('JavaScript', '0.3.5') => '[JavaScript] 0.3.5'
 *   buildReleaseTitle('JavaScript', 'js-v0.3.5') => '[JavaScript] 0.3.5'
 *   buildReleaseTitle('Rust', 'rust-v0.2.1') => '[Rust] 0.2.1'
 */
export function buildReleaseTitle(language, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `[${language}] ${semver}`;
}

/**
 * Build the canonical git tag for a language release. The convention from
 * issue #33 is `<lang>_v<semver>` (e.g. `js_v0.3.5`).
 */
export function buildReleaseTag(tagPrefix, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `${tagPrefix}${semver}`;
}
