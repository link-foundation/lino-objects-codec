#!/usr/bin/env node

/**
 * Create GitHub Release from CHANGELOG.md for Rust package
 * Usage: node scripts/create-github-release.mjs --version <version> --repository <repository> [--tag-prefix <prefix>] [--language <name>]
 *   version: Version number (e.g., 1.0.0)
 *   repository: GitHub repository (e.g., owner/repo)
 *   tag-prefix: Tag prefix (default: "rust_v")
 *   language: Display label for the release title (default: "Rust")
 *
 * Per issue #33, Rust releases must use:
 *   - Tag format:   rust_v<semver>
 *   - Title format: [Rust] X.Y.Z
 *   - Body MUST contain a crates.io shields.io badge
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync } from 'fs';

import { isAlreadyExistingReleaseError } from './crates-release-helpers.mjs';
import {
  buildCratesIoVersionBadge,
  buildReleaseTag,
  buildReleaseTitle,
  normalizeReleaseVersionForBadge,
} from './release-format-helpers.mjs';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import link-foundation libraries
const { $ } = await use('command-stream');
const { makeConfig } = await use('lino-arguments');

const CARGO_TOML_PATH = './Cargo.toml';

function readCrateName() {
  try {
    const cargoToml = readFileSync(CARGO_TOML_PATH, 'utf8');
    // [package]\nname = "..."  - the simplest possible parser since we
    // control this file shape.
    const match = cargoToml.match(/\[package\][\s\S]*?\bname\s*=\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch {
    // fall through
  }
  return null;
}

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
        default: getenv('TAG_PREFIX', 'rust_v'),
        describe: 'Tag prefix for the release',
      })
      .option('language', {
        type: 'string',
        default: getenv('LANGUAGE', 'Rust'),
        describe: 'Human-readable language label (used in the release title)',
      })
      .option('crate-name', {
        type: 'string',
        default: getenv('CRATE_NAME', ''),
        describe:
          'Crate name for crates.io badge (auto-detected from Cargo.toml if not specified)',
      }),
});

const { releaseVersion, repository, tagPrefix, language } = config;
const rawVersion = config.version || releaseVersion;

if (!rawVersion || !repository) {
  console.error('Error: Missing required arguments');
  console.error(
    'Usage: node scripts/create-github-release.mjs --version <version> --repository <repository>'
  );
  process.exit(1);
}

const semver = normalizeReleaseVersionForBadge(rawVersion);
const tag = buildReleaseTag(tagPrefix, semver);
const title = buildReleaseTitle(language, semver);
const crateName = config.crateName || readCrateName();

console.log(`Creating GitHub release for ${tag} (title: ${title})...`);

try {
  // Read CHANGELOG.md
  let changelog = '';
  try {
    changelog = readFileSync('./CHANGELOG.md', 'utf8');
  } catch {
    changelog = '';
  }

  // Extract changelog entry for this version
  // Read from CHANGELOG.md between this version header and the next version header
  const versionHeaderRegex = new RegExp(
    `## \\[?${semver.replace(/\./g, '\\.')}\\]?[\\s\\S]*?(?=## \\[?\\d|$)`
  );
  const match = changelog.match(versionHeaderRegex);

  let releaseNotes = '';
  if (match) {
    // Remove the version header itself and trim
    releaseNotes = match[0]
      .replace(
        new RegExp(`## \\[?${semver.replace(/\./g, '\\.')}\\]?[^\\n]*`),
        ''
      )
      .trim();
  }

  if (!releaseNotes) {
    releaseNotes = `Release ${semver}`;
  }

  // Append crates.io badge so every Rust release has a registry link, even
  // when the changelog body itself does not embed one. The format-release
  // script will skip any release that already contains a shields.io badge,
  // so adding it here is idempotent.
  if (crateName && !/img\.shields\.io/.test(releaseNotes)) {
    const badge = buildCratesIoVersionBadge(crateName, semver);
    releaseNotes = `${releaseNotes}\n\n---\n\n${badge}`;
  }

  // Create release using GitHub API with JSON input
  // This avoids shell escaping issues that occur when passing text via command-line arguments
  const payload = JSON.stringify({
    tag_name: tag,
    name: title,
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

  console.log(`✅ Created GitHub release: ${tag}`);
} catch (error) {
  console.error('Error creating release:', error.message);
  process.exit(1);
}
