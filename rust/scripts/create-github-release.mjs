#!/usr/bin/env node

/**
 * Create GitHub Release from CHANGELOG.md for Rust package
 * Usage: node scripts/create-github-release.mjs --version <version> --repository <repository> [--tag-prefix <prefix>]
 *   version: Version number (e.g., 1.0.0)
 *   repository: GitHub repository (e.g., owner/repo)
 *   tag-prefix: Tag prefix (default: "rust-v")
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync } from 'fs';

import { isAlreadyExistingReleaseError } from './crates-release-helpers.mjs';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import link-foundation libraries
const { $ } = await use('command-stream');
const { makeConfig } = await use('lino-arguments');

// Parse CLI arguments using lino-arguments
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .version(false) // Disable yargs built-in --version to use our custom version option
      .option('version', {
        type: 'string',
        default: getenv('VERSION', getenv('RELEASE_VERSION', '')),
        describe: 'Version number (e.g., 1.0.0)',
      })
      .option('release-version', {
        type: 'string',
        default: getenv('RELEASE_VERSION', ''),
        describe: 'Version number (alias for --version)',
      })
      .option('repository', {
        type: 'string',
        default: getenv('REPOSITORY', ''),
        describe: 'GitHub repository (e.g., owner/repo)',
      })
      .option('tag-prefix', {
        type: 'string',
        default: getenv('TAG_PREFIX', 'rust-v'),
        describe: 'Tag prefix for the release',
      }),
});

const { releaseVersion, repository, tagPrefix } = config;
const version = config.version || releaseVersion;

if (!version || !repository) {
  console.error('Error: Missing required arguments');
  console.error(
    'Usage: node scripts/create-github-release.mjs --version <version> --repository <repository>'
  );
  process.exit(1);
}

const tag = `${tagPrefix}${version}`;

console.log(`Creating GitHub release for ${tag}...`);

try {
  // Read CHANGELOG.md
  const changelog = readFileSync('./CHANGELOG.md', 'utf8');

  // Extract changelog entry for this version
  // Read from CHANGELOG.md between this version header and the next version header
  const versionHeaderRegex = new RegExp(
    `## \\[?${version.replace(/\./g, '\\.')}\\]?[\\s\\S]*?(?=## \\[?\\d|$)`
  );
  const match = changelog.match(versionHeaderRegex);

  let releaseNotes = '';
  if (match) {
    // Remove the version header itself and trim
    releaseNotes = match[0]
      .replace(
        new RegExp(`## \\[?${version.replace(/\./g, '\\.')}\\]?[^\\n]*`),
        ''
      )
      .trim();
  }

  if (!releaseNotes) {
    releaseNotes = `Release ${version}`;
  }

  // Create release using GitHub API with JSON input
  // This avoids shell escaping issues that occur when passing text via command-line arguments
  const payload = JSON.stringify({
    tag_name: tag,
    name: `Rust ${version}`,
    body: releaseNotes,
  });

  const result =
    await $`gh api repos/${repository}/releases -X POST --input -`.run({
      stdin: payload,
      capture: true,
    });

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  if (result.code && result.code !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (isAlreadyExistingReleaseError(output)) {
      console.log(`GitHub release already exists: ${tag}`);
      process.exit(0);
    }
    throw new Error(`gh api exited with code ${result.code}`);
  }

  console.log(`\u2705 Created GitHub release: ${tag}`);
} catch (error) {
  console.error('Error creating release:', error.message);
  process.exit(1);
}
