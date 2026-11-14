/** Recognize an actual HTTPS Shields image rather than a hostname in prose. */
export function hasShieldsBadge(body) {
  for (const match of body.matchAll(
    /!\[[^\]!\r\n]*\]\((https?:\/\/[^\s)]+)\)/g
  )) {
    try {
      const url = new URL(match[1]);
      if (url.origin === 'https://img.shields.io') return true;
    } catch {
      // A malformed image URL is not a badge.
    }
  }
  return false;
}

/** Match version text literally, including prerelease and build identifiers. */
export function extractChangelogEntry(changelog, version) {
  const header = new RegExp(
    `^## \\[?${RegExp.escape(version)}\\]?(?:[ \\t].*)?$`,
    'm'
  );
  const match = header.exec(changelog);
  if (!match) return '';
  const rest = changelog.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}
