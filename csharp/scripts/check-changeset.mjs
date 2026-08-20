#!/usr/bin/env node

/**
 * Check that a changeset was added in the current PR.
 *
 * Replaces the inline shell check that used to live in .github/workflows/csharp.yml.
 * That version had two defects, both found while working on issue #41:
 *
 *   1. It printed `::warning::No changeset found` and then `exit 0`, so the
 *      check could never fail. A PR could change csharp/src without any
 *      release note and still show a green "Changeset Check".
 *   2. It counted every file in `.changeset/`, so a leftover fragment from an
 *      earlier, not-yet-released PR satisfied the check for a new PR that
 *      added nothing. This script looks at the PR diff instead.
 *
 * Mirrors rust/scripts/check-changelog-fragment.mjs.
 *
 * Usage: node scripts/check-changeset.mjs   (from the `csharp` directory)
 *
 * Environment variables (set by GitHub Actions):
 *   - GITHUB_BASE_REF: base branch name for the PR (for example "main")
 *   - HEAD_REF:        PR head branch; automated release branches are exempt
 *
 * Exit codes:
 *   - 0: check passed (changeset added, or no source changes)
 *   - 1: check failed (source changes without a changeset)
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Branch prefixes used by the automated release jobs. Those PRs only bump
 * versions and consume changesets, so requiring a new one would deadlock them.
 * @type {string[]}
 */
export const RELEASE_BRANCH_PREFIXES = [
  'changeset-release/',
  'changeset-manual-release-',
];

/**
 * Check whether a branch belongs to an automated release PR.
 * @param {string | undefined} headRef
 * @returns {boolean}
 */
export function isReleaseBranch(headRef) {
  if (!headRef) {
    return false;
  }
  return RELEASE_BRANCH_PREFIXES.some((prefix) => headRef.startsWith(prefix));
}

/**
 * Check whether a file is a source file that requires a changeset.
 * Paths are relative to the `csharp` directory.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSourceFile(filePath) {
  const sourcePatterns = [/^src\//, /^tests\//, /^examples\//, /^scripts\//, /\.csproj$/];
  return sourcePatterns.some((pattern) => pattern.test(filePath));
}

/**
 * Check whether a file is a changeset fragment.
 * `README.md` documents the directory and `config.json` configures it.
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
 * Decide the outcome of the check from a list of changed files.
 * @param {string[]} changedFiles
 * @returns {{ ok: boolean, sourceFiles: string[], changesets: string[] }}
 */
export function evaluate(changedFiles) {
  const sourceFiles = changedFiles.filter(isSourceFile);
  const changesets = changedFiles.filter(isChangeset);
  return {
    ok: sourceFiles.length === 0 || changesets.length > 0,
    sourceFiles,
    changesets,
  };
}

/**
 * Get the list of files changed in the PR, relative to the `csharp` directory.
 *
 * `--relative` is essential in this monorepo: without it git prints
 * repo-root-relative paths such as `csharp/src/...`, which match neither
 * `^src/` nor `.changeset/`, silently disabling the check. See issue #39 for
 * the same bug in the Rust script.
 * @returns {string[]}
 */
export function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  console.log(`Comparing against origin/${baseRef}...HEAD`);

  try {
    const output = execSync(
      `git diff --name-only --relative origin/${baseRef}...HEAD`,
      { encoding: 'utf-8' }
    ).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch (error) {
    console.error(`Git diff failed: ${error.message}`);
    return [];
  }
}

/**
 * Run the check.
 * @returns {number} process exit code
 */
export function main() {
  if (isReleaseBranch(process.env.HEAD_REF)) {
    console.log('Automated release PR detected; skipping the changeset check.');
    return 0;
  }

  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('No changed files found.');
    return 0;
  }

  const { ok, sourceFiles, changesets } = evaluate(changedFiles);

  console.log(`Source files changed: ${sourceFiles.length}`);
  sourceFiles.forEach((file) => console.log(`  ${file}`));
  console.log(`Changesets added: ${changesets.length}`);
  changesets.forEach((file) => console.log(`  ${file}`));

  if (ok) {
    console.log('Changeset check passed.');
    return 0;
  }

  console.error(
    '::error::No changeset found in this PR. Add a release note in csharp/.changeset/'
  );
  console.error('');
  console.error('To create a changeset:');
  console.error('  Add csharp/.changeset/YYYYMMDD_HHMMSS_description.md');
  console.error('');
  console.error('See csharp/.changeset/README.md for the expected format.');
  return 1;
}

const entryPath = process.argv[1];
const invokedDirectly =
  typeof entryPath === 'string' &&
  entryPath.length > 0 &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href;

if (invokedDirectly) {
  process.exit(main());
}
