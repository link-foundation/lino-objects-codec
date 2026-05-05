/**
 * C# mirror of js/scripts/release-format-helpers.mjs.
 *
 * Tag prefix convention (per issue #33): csharp_v<semver>
 * Title convention:                       [C#] X.Y.Z
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

export function buildNuGetVersionBadge(packageName, releaseVersion) {
  const versionWithoutV = normalizeReleaseVersionForBadge(releaseVersion);
  const badgeVersion = encodeShieldsStaticBadgeSegment(versionWithoutV);
  const packageVersionPath = encodeURIComponent(versionWithoutV);

  return `[![NuGet](https://img.shields.io/badge/nuget-${badgeVersion}-blue.svg)](https://www.nuget.org/packages/${packageName}/${packageVersionPath})`;
}

export function buildReleaseTitle(language, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `[${language}] ${semver}`;
}

export function buildReleaseTag(tagPrefix, releaseVersion) {
  const semver = normalizeReleaseVersionForBadge(releaseVersion);
  return `${tagPrefix}${semver}`;
}

export function isAlreadyExistingReleaseError(output) {
  if (!output) return false;
  const lower = output.toLowerCase();
  return (
    lower.includes('already_exists') ||
    lower.includes('already exists') ||
    lower.includes('validation failed')
  );
}
