#!/usr/bin/env node

/**
 * Create GitHub Release from CHANGELOG.md
 * Usage: node scripts/create-github-release.mjs --release-version <version> --repository <repository> [--tag-prefix <prefix>] [--language <name>]
 *   release-version: Version number (e.g., 1.0.0)
 *   repository: GitHub repository (e.g., owner/repo)
 *   tag-prefix: Prefix for the git tag (default: "v", use "js_v" for multi-language repos)
 *   language: Display label for the release title (default: "JavaScript")
 *
 * Per issue #33, JS releases must use:
 *   - Tag format:   js_v<semver>     (was: js-v<semver>)
 *   - Title format: [JavaScript] X.Y.Z (was: js-v0.3.5)
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync } from 'fs';
import {
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

// Parse CLI arguments using lino-arguments
// Note: Using --release-version instead of --version to avoid conflict with yargs' built-in --version flag
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('release-version', {
        type: 'string',
        default: getenv('VERSION', ''),
        describe: 'Version number (e.g., 1.0.0)',
      })
      .option('repository', {
        type: 'string',
        default: getenv('REPOSITORY', ''),
        describe: 'GitHub repository (e.g., owner/repo)',
      })
      .option('tag-prefix', {
        type: 'string',
        default: getenv('TAG_PREFIX', 'v'),
        describe:
          'Prefix for the git tag (e.g., "js_v" for multi-language repos)',
      })
      .option('language', {
        type: 'string',
        default: getenv('LANGUAGE', 'JavaScript'),
        describe:
          'Human-readable language label (used in the release title, e.g. "JavaScript")',
      }),
});

const { releaseVersion, repository, tagPrefix, language } = config;

if (!releaseVersion || !repository) {
  console.error('Error: Missing required arguments');
  console.error(
    'Usage: node scripts/create-github-release.mjs --release-version <version> --repository <repository> [--tag-prefix <prefix>] [--language <name>]'
  );
  process.exit(1);
}

// Strip any prefix the caller may have included so downstream callers get a
// canonical bare semver (e.g. "js-v0.3.5" -> "0.3.5").
const semver = normalizeReleaseVersionForBadge(releaseVersion);
const tag = buildReleaseTag(tagPrefix, semver);
const title = buildReleaseTitle(language, semver);

console.log(`Creating GitHub release for ${tag} (title: ${title})...`);

try {
  // Read CHANGELOG.md
  const changelog = readFileSync('./CHANGELOG.md', 'utf8');

  // Extract changelog entry for this version
  // Read from CHANGELOG.md between this version header and the next version header
  const versionHeaderRegex = new RegExp(`## ${semver}[\\s\\S]*?(?=## \\d|$)`);
  const match = changelog.match(versionHeaderRegex);

  let releaseNotes = '';
  if (match) {
    // Remove the version header itself and trim
    releaseNotes = match[0].replace(`## ${semver}`, '').trim();
  }

  if (!releaseNotes) {
    releaseNotes = `Release ${semver}`;
  }

  // Create release using GitHub API with JSON input
  // This avoids shell escaping issues that occur when passing text via command-line arguments
  // (Previously caused apostrophes like "didn't" to appear as "didn'''" in releases)
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
    if (/already_exists/i.test(output)) {
      console.log(`GitHub release already exists: ${tag}. Skipping creation.`);
      process.exit(0);
    }
    throw new Error(`gh api exited with code ${result.code}`);
  }

  console.log(`✅ Created GitHub release: ${tag}`);
} catch (error) {
  console.error('Error creating release:', error.message);
  process.exit(1);
}
