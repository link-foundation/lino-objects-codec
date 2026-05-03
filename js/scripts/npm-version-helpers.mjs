export const MINIMUM_NPM_VERSION = '11.5.1';
export const MINIMUM_NODE_VERSION = '22.14.0';
export const TRUSTED_PUBLISHING_NPM_MAJOR = 11;

export function parseVersion(version) {
  const clean = String(version).trim().replace(/^v/, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return match.slice(1, 4).map(Number);
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
}

export function isVersionAtLeast(version, minimum) {
  return compareVersions(version, minimum) >= 0;
}

export function selectLatestSatisfyingMajor({ versions, major, minimum }) {
  return versions
    .filter((version) => {
      try {
        const [candidateMajor] = parseVersion(version);
        return candidateMajor === major && isVersionAtLeast(version, minimum);
      } catch {
        return false;
      }
    })
    .sort(compareVersions)
    .at(-1);
}
