#!/usr/bin/env node

/**
 * Validate changeset for CI - ensures the PR adds exactly one valid changeset.
 *
 * Issue #71: this script used to count every file in `.changeset/`. The
 * changeset-check job merges the latest base branch first (best practice #7),
 * so any changeset still waiting on main (for example after a failed release)
 * made every other PR fail with "Multiple changesets found", and a leftover
 * changeset satisfied the check for a PR that added none. Only changesets the
 * PR itself adds are counted now, the same way rust/scripts/check-changelog-
 * fragment.mjs, python/scripts/validate_changeset.py and
 * csharp/scripts/check-changeset.mjs decide.
 *
 * Environment variables (set by GitHub Actions):
 *   - GITHUB_BASE_REF: base branch name for the PR (defaults to "main")
 *   - HEAD_REF:        PR head branch; automated release branches are exempt
 *   - PR_AUTHOR:       PR author login; Dependabot PRs are exempt
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_NAME = 'lino-objects-codec';

/** Branch prefixes of the automated release PRs, which only consume changesets. */
export const RELEASE_BRANCH_PREFIXES = [
  'changeset-release/',
  'changeset-manual-release-',
];

/** Logins whose PRs cannot add a changeset themselves. */
export const BOT_AUTHORS = ['dependabot[bot]'];

/**
 * Decide whether the PR is exempt from the changeset requirement.
 * @param {{ headRef?: string, author?: string }} pr
 * @returns {string | null} the reason, or null when the check applies
 */
export function exemption({ headRef, author }) {
  if (
    headRef &&
    RELEASE_BRANCH_PREFIXES.some((prefix) => headRef.startsWith(prefix))
  ) {
    return 'automated release PR';
  }
  // The author, not the branch name, decides: anyone can name a branch
  // `dependabot/...`, but only Dependabot opens PRs as dependabot[bot].
  if (author && BOT_AUTHORS.includes(author)) {
    return `${author} cannot write a changeset; add one by hand if this update should ship a release`;
  }
  return null;
}

/**
 * Check whether a path (relative to `js/`) is a changeset fragment.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isChangeset(filePath) {
  return (
    filePath.startsWith('.changeset/') &&
    filePath.endsWith('.md') &&
    !filePath.endsWith('README.md')
  );
}

/**
 * Validate the content of a changeset.
 * @param {string} content
 * @returns {{ ok: boolean, error?: string, versionType?: string, description?: string }}
 */
export function validateContent(content) {
  const versionTypeRegex = new RegExp(
    `^['"]${PACKAGE_NAME}['"]:\\s+(major|minor|patch)`,
    'm'
  );
  const versionTypeMatch = content.match(versionTypeRegex);
  if (!versionTypeMatch) {
    return {
      ok: false,
      error: `Changeset must specify a version type: '${PACKAGE_NAME}': major, minor, or patch`,
    };
  }
  const parts = content.split('---');
  const description = parts.slice(2).join('---').trim();
  if (parts.length < 3 || !description) {
    return {
      ok: false,
      error: "Changeset must include a description after the closing '---'",
    };
  }
  return { ok: true, versionType: versionTypeMatch[1], description };
}

/**
 * Changesets added by the PR, relative to the `js` directory.
 * @returns {string[]}
 */
export function getAddedChangesets() {
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  console.log(`Comparing against origin/${baseRef}...HEAD`);
  const output = execSync(
    `git diff --name-only --relative --diff-filter=A origin/${baseRef}...HEAD -- .changeset`,
    { encoding: 'utf-8' }
  ).trim();
  return output ? output.split('\n').filter(isChangeset) : [];
}

/**
 * Run the check.
 * @returns {number} process exit code
 */
export function main() {
  const reason = exemption({
    headRef: process.env.HEAD_REF,
    author: process.env.PR_AUTHOR,
  });
  if (reason) {
    console.log(`::notice title=Changeset check skipped::${reason}.`);
    return 0;
  }

  const changesets = getAddedChangesets();
  console.log(`PR adds ${changesets.length} changeset file(s)`);
  changesets.forEach((file) => console.log(`  ${file}`));

  if (changesets.length === 0) {
    console.error(
      "::error::No changeset found. Please add a changeset by running 'npm run changeset' and commit the result."
    );
    return 1;
  }
  if (changesets.length > 1) {
    console.error(
      `::error::Multiple changesets added (${changesets.length}). Each PR should add exactly ONE changeset.`
    );
    return 1;
  }

  const content = readFileSync(changesets[0], 'utf-8');
  const result = validateContent(content);
  if (!result.ok) {
    console.error(`::error file=js/${changesets[0]}::${result.error}`);
    console.error(
      `Expected format:\n---\n'${PACKAGE_NAME}': patch\n---\n\nYour description here`
    );
    console.error(`\nFile content:\n${content}`);
    return 1;
  }

  console.log('✅ Changeset validation passed');
  console.log(`   Type: ${result.versionType}`);
  console.log(`   Description: ${result.description}`);
  return 0;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    process.exit(main());
  } catch (error) {
    console.error('Error during changeset validation:', error.message);
    if (process.env.DEBUG) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}
