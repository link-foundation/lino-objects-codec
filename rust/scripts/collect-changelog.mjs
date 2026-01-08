#!/usr/bin/env node

/**
 * Collect changelog fragments into CHANGELOG.md
 * Usage: node scripts/collect-changelog.mjs [--version <version>]
 *   version: Version to use in the changelog entry (default: from Cargo.toml)
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import link-foundation libraries
const { makeConfig } = await use('lino-arguments');

// Parse CLI arguments using lino-arguments
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .version(false) // Disable yargs built-in --version to use our custom version option
      .option('version', {
      type: 'string',
      default: getenv('VERSION', ''),
      describe: 'Version to use in the changelog entry',
    }),
});

let { version } = config;

/**
 * Get version from Cargo.toml
 */
function getVersionFromCargo() {
  const cargoToml = readFileSync('./Cargo.toml', 'utf8');
  const match = cargoToml.match(/^version = "([^"]+)"/m);
  if (!match) {
    throw new Error('Could not find version in Cargo.toml');
  }
  return match[1];
}

/**
 * Parse frontmatter from changelog fragment
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = {};
  match[1].split('\n').forEach((line) => {
    const [key, value] = line.split(':').map((s) => s.trim());
    if (key && value) {
      frontmatter[key] = value;
    }
  });
  return { frontmatter, body: match[2] };
}

try {
  // Get version if not provided
  if (!version) {
    version = getVersionFromCargo();
  }
  console.log(`Collecting changelog fragments for version ${version}`);

  // Get changelog fragments
  const changelogDir = './changelog.d';
  let files;
  try {
    files = readdirSync(changelogDir);
  } catch {
    console.log('No changelog.d directory found');
    process.exit(0);
  }

  const fragments = files
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({
      path: join(changelogDir, f),
      content: readFileSync(join(changelogDir, f), 'utf8'),
    }));

  if (fragments.length === 0) {
    console.log('No changelog fragments found');
    process.exit(0);
  }

  console.log(`Found ${fragments.length} changelog fragment(s)`);

  // Collect all fragment bodies
  const entries = fragments
    .map((f) => parseFrontmatter(f.content).body.trim())
    .filter((body) => body.length > 0)
    .join('\n\n');

  // Get current date
  const date = new Date().toISOString().split('T')[0];

  // Create new version entry
  const newEntry = `## [${version}] - ${date}\n\n${entries}`;

  // Read existing CHANGELOG.md
  let changelog = '';
  try {
    changelog = readFileSync('./CHANGELOG.md', 'utf8');
  } catch {
    changelog = '# Changelog\n\n';
  }

  // Insert new entry after [Unreleased] section or at the top
  const unreleasedMatch = changelog.match(/## \[Unreleased\][^\n]*\n/);
  if (unreleasedMatch) {
    const insertPos = unreleasedMatch.index + unreleasedMatch[0].length;
    changelog =
      changelog.slice(0, insertPos) + '\n' + newEntry + '\n' + changelog.slice(insertPos);
  } else {
    // Insert after header
    const headerMatch = changelog.match(/# Changelog[^\n]*\n/);
    if (headerMatch) {
      const insertPos = headerMatch.index + headerMatch[0].length;
      changelog =
        changelog.slice(0, insertPos) + '\n' + newEntry + '\n\n' + changelog.slice(insertPos);
    } else {
      changelog = '# Changelog\n\n' + newEntry + '\n\n' + changelog;
    }
  }

  writeFileSync('./CHANGELOG.md', changelog);
  console.log('Updated CHANGELOG.md');

  // Delete processed fragments
  for (const fragment of fragments) {
    unlinkSync(fragment.path);
    console.log(`Deleted ${fragment.path}`);
  }

  console.log(`\n\u2705 Collected ${fragments.length} fragment(s) into CHANGELOG.md`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
