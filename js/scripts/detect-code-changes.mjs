#!/usr/bin/env node

/**
 * Detect code changes for CI/CD pipeline
 *
 * This script detects what types of files have changed between two commits
 * and outputs the results for use in GitHub Actions workflow conditions.
 *
 * Key behavior:
 * - For PRs: compares PR head against base branch
 * - For pushes: compares HEAD against HEAD^
 * - Excludes certain folders and file types from "code changes" detection
 *
 * Excluded from code changes (don't require changesets):
 * - Markdown files (*.md) in any folder
 * - .changeset/ folder (changeset metadata)
 * - docs/ folder (documentation)
 * - experiments/ folder (experimental scripts)
 * - examples/ folder (example scripts)
 *
 * Usage:
 *   node scripts/detect-code-changes.mjs
 *
 * Environment variables (set by GitHub Actions):
 *   - GITHUB_EVENT_NAME: 'pull_request' or 'push'
 *   - GITHUB_BASE_SHA: Base commit SHA for PR
 *   - GITHUB_HEAD_SHA: Head commit SHA for PR
 *
 * Outputs (written to GITHUB_OUTPUT):
 *   - mjs-changed: 'true' if any .mjs files changed
 *   - js-changed: 'true' if any .js files changed
 *   - package-changed: 'true' if package.json changed
 *   - docs-changed: 'true' if any .md files changed
 *   - workflow-changed: 'true' if any .github/workflows/ files changed
 *   - any-code-changed: 'true' if any code files changed (excludes docs, changesets, experiments, examples)
 */

import { execSync } from 'child_process';
import { appendFileSync } from 'fs';
import { pathToFileURL } from 'url';

/**
 * Execute a shell command and return trimmed output
 * @param {string} command - The command to execute
 * @returns {string} - The trimmed command output
 */
function exec(command) {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    return '';
  }
}

/**
 * Write output to GitHub Actions output file
 * @param {string} name - Output name
 * @param {string} value - Output value
 */
function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

/**
 * Get the list of changed files between two commits
 * @returns {string[]} Array of changed file paths
 */
export function getChangedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME || 'local';

  if (eventName === 'pull_request') {
    const baseSha = process.env.GITHUB_BASE_SHA;
    const headSha = process.env.GITHUB_HEAD_SHA;

    if (baseSha && headSha) {
      console.log(`Comparing PR: ${baseSha}...${headSha}`);
      try {
        // Ensure we have the base commit
        try {
          execSync(`git cat-file -e ${baseSha}`, { stdio: 'ignore' });
        } catch {
          console.log('Base commit not available locally, attempting fetch...');
          execSync(`git fetch origin ${baseSha}`, { stdio: 'inherit' });
        }
        const output = exec(`git diff --name-only ${baseSha} ${headSha}`);
        return output ? output.split('\n').filter(Boolean) : [];
      } catch (error) {
        console.error(`Git diff failed: ${error.message}`);
      }
    }
  }

  // For push events or fallback
  console.log('Comparing HEAD^ to HEAD');
  try {
    const output = exec('git diff --name-only HEAD^ HEAD');
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    // If HEAD^ doesn't exist (first commit), list all files in HEAD
    console.log('HEAD^ not available, listing all files in HEAD');
    const output = exec('git ls-tree --name-only -r HEAD');
    return output ? output.split('\n').filter(Boolean) : [];
  }
}

/**
 * Path of the current working directory relative to the repository root.
 *
 * `git diff --name-only` always prints paths relative to the **repository
 * root**, but this script runs with `working-directory: ./js` and compares
 * those paths against package-relative prefixes such as `examples/`. In this
 * monorepo the real paths are `js/examples/...`, so before issue #41 none of
 * the exclusions ever matched and `package.json` could never be detected -- the
 * same class of defect as issue #39. Resolving the prefix at run time keeps the
 * script correct both here and in a single-package checkout, where the prefix
 * is empty.
 *
 * @returns {string} The prefix, ending with `/`, or `''` at the repository root
 */
export function getPathPrefix() {
  return exec('git rev-parse --show-prefix');
}

/**
 * Re-express repository-root-relative paths as package-relative paths,
 * dropping everything that lives outside this package.
 *
 * @param {string[]} changedFiles - Repository-root-relative paths
 * @param {string} prefix - Package prefix such as `js/`
 * @returns {string[]} Package-relative paths
 */
export function toPackagePaths(changedFiles, prefix) {
  if (!prefix) {
    return changedFiles;
  }
  return changedFiles
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length));
}

/**
 * Check whether a repository-root-relative path is a workflow definition.
 *
 * @param {string} filePath - Repository-root-relative path
 * @returns {boolean} True for files under `.github/workflows/`
 */
export function isWorkflowFile(filePath) {
  return filePath.startsWith('.github/workflows/');
}

/**
 * Check if a file should be excluded from code changes detection
 * @param {string} filePath - The file path to check
 * @returns {boolean} True if the file should be excluded
 */
export function isExcludedFromCodeChanges(filePath) {
  // Exclude markdown files in any folder
  if (filePath.endsWith('.md')) {
    return true;
  }

  // Exclude specific folders from code changes
  const excludedFolders = ['.changeset/', 'docs/', 'experiments/', 'examples/'];

  for (const folder of excludedFolders) {
    if (filePath.startsWith(folder)) {
      return true;
    }
  }

  return false;
}

/**
 * Classify a set of repository-root-relative changed paths.
 *
 * Split out from `detectChanges` so the classification can be unit tested
 * without a git repository.
 *
 * @param {string[]} changedFiles - Repository-root-relative changed paths
 * @param {string} prefix - Package prefix such as `js/`
 * @returns {{outputs: Record<string, string>, packageFiles: string[], codeChangedFiles: string[]}}
 */
export function classifyChanges(changedFiles, prefix) {
  const packageFiles = toPackagePaths(changedFiles, prefix);
  const workflowFiles = changedFiles.filter(isWorkflowFile);

  // Code changes are judged on package-relative paths, so the documented
  // `examples/`, `experiments/`, `docs/` and `.changeset/` exclusions apply.
  const codeChangedFiles = packageFiles.filter(
    (file) => !isExcludedFromCodeChanges(file)
  );

  // A workflow change still counts as a code change: it can alter how this
  // package is built and published even when no package file moved.
  const codePattern = /\.(mjs|js|json|yml|yaml)$/;
  const codeChanged =
    codeChangedFiles.some((file) => codePattern.test(file)) ||
    workflowFiles.length > 0;

  return {
    packageFiles,
    codeChangedFiles,
    outputs: {
      'mjs-changed': String(packageFiles.some((f) => f.endsWith('.mjs'))),
      'js-changed': String(packageFiles.some((f) => f.endsWith('.js'))),
      'package-changed': String(packageFiles.includes('package.json')),
      'docs-changed': String(packageFiles.some((f) => f.endsWith('.md'))),
      'workflow-changed': String(workflowFiles.length > 0),
      'any-code-changed': String(codeChanged),
    },
  };
}

/**
 * Main function to detect changes
 */
export function detectChanges() {
  console.log('Detecting file changes for CI/CD...\n');

  const changedFiles = getChangedFiles();
  const prefix = getPathPrefix();

  console.log(`Package prefix: ${prefix || '(repository root)'}`);
  console.log('Changed files:');
  if (changedFiles.length === 0) {
    console.log('  (none)');
  } else {
    changedFiles.forEach((file) => console.log(`  ${file}`));
  }
  console.log('');

  const { codeChangedFiles, outputs } = classifyChanges(changedFiles, prefix);

  console.log('Files considered as code changes:');
  if (codeChangedFiles.length === 0) {
    console.log('  (none)');
  } else {
    codeChangedFiles.forEach((file) => console.log(`  ${file}`));
  }
  console.log('');

  for (const [name, value] of Object.entries(outputs)) {
    setOutput(name, value);
  }

  console.log('\nChange detection completed.');
}

// Run the detection unless this module was imported by a test.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  detectChanges();
}
