#!/usr/bin/env node

/**
 * Create GitHub Release from CHANGELOG.md for C# package
 * Usage: node scripts/create-github-release.mjs --version <version> --repository <repository> [--tag-prefix <prefix>] [--language <name>] [--package-name <name>]
 *   version: Version number (e.g., 1.0.0)
 *   repository: GitHub repository (e.g., owner/repo)
 *   tag-prefix: Tag prefix (default: "csharp_v")
 *   language: Display label for the release title (default: "C#")
 *   package-name: NuGet package name for the badge (auto-detected from .csproj if missing)
 *
 * Per issue #33:
 *   - Tag format:   csharp_v<semver>
 *   - Title format: [C#] X.Y.Z
 *   - Body MUST contain a NuGet shields.io badge
 *   - The script must check `gh api` exit code so 422 (e.g. tag conflicts)
 *     no longer reports a false-positive success.
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

import {
  buildNuGetVersionBadge,
  buildReleaseTag,
  buildReleaseTitle,
  isAlreadyExistingReleaseError,
  normalizeReleaseVersionForBadge,
} from './release-format-helpers.mjs';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import link-foundation libraries
const { $ } = await use('command-stream');
const { makeConfig } = await use('lino-arguments');

function findCsprojPackageName(rootDir = '.') {
  // Walk a small tree (one level deep) to find the first .csproj with
  // <PackageId> or <AssemblyName>. We avoid pulling in an XML parser
  // because the value we need is always a single tag inside a PropertyGroup.
  const candidates = [];
  function walk(dir, depth) {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'bin' || entry === 'obj') continue;
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (full.endsWith('.csproj')) {
        candidates.push(full);
      }
    }
  }
  walk(rootDir, 0);

  for (const csproj of candidates) {
    let xml;
    try {
      xml = readFileSync(csproj, 'utf8');
    } catch {
      continue;
    }
    const packageIdMatch = xml.match(/<PackageId>([^<]+)<\/PackageId>/);
    if (packageIdMatch) return packageIdMatch[1].trim();
    const assemblyNameMatch = xml.match(/<AssemblyName>([^<]+)<\/AssemblyName>/);
    if (assemblyNameMatch) return assemblyNameMatch[1].trim();
    // Fall back to the file name (without extension).
    return path.basename(csproj, '.csproj');
  }
  return null;
}

const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .version(false) // Disable yargs built-in --version to use our custom version option
      .option('version', {
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
        default: getenv('TAG_PREFIX', 'csharp_v'),
        describe: 'Tag prefix for the release',
      })
      .option('language', {
        type: 'string',
        default: getenv('LANGUAGE', 'C#'),
        describe: 'Human-readable language label (used in the release title)',
      })
      .option('package-name', {
        type: 'string',
        default: getenv('PACKAGE_NAME', ''),
        describe:
          'NuGet package name for the badge (auto-detected from .csproj if missing)',
      }),
});

const { version: rawVersion, repository, tagPrefix, language } = config;

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
const packageName = config.packageName || findCsprojPackageName('.');

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

  if (packageName && !/img\.shields\.io/.test(releaseNotes)) {
    const badge = buildNuGetVersionBadge(packageName, semver);
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
