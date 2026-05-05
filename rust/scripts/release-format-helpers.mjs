/**
 * Rust mirror of js/scripts/release-format-helpers.mjs.
 *
 * Tag prefix convention (per issue #33): rust_v<semver>
 * Title convention:                       [Rust] X.Y.Z
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

export function buildCratesIoVersionBadge(crateName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const crateVersionPath = encodeURIComponent(versionWithoutV);

  return `[![crates.io](https://img.shields.io/badge/crates.io-${badgeVersion}-orange.svg)](https://crates.io/crates/${crateName}/${crateVersionPath})`;
}

export function buildReleaseTitle(language, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `[${language}] ${semver}`;
}

export function buildReleaseTag(tagPrefix, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `${tagPrefix}${semver}`;
}
