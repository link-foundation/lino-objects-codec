#!/usr/bin/env node

/**
 * Bump version in Cargo.toml
 * Usage: node scripts/bump-version.mjs --bump-type <type> [--dry-run]
 *   bump-type: Version bump type (patch|minor|major)
 *   dry-run: Print what would happen without making changes
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync, writeFileSync } from 'fs';

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
      .option('bump-type', {
        type: 'string',
        default: getenv('BUMP_TYPE', ''),
        describe: 'Version bump type: major, minor, or patch',
        choices: ['major', 'minor', 'patch'],
      })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Print what would happen without making changes',
      }),
});

const { bumpType, dryRun } = config;

// Validation: Ensure bump type is provided
if (!bumpType) {
  console.error('Error: --bump-type is required');
  console.error(
    'Usage: node scripts/bump-version.mjs --bump-type <major|minor|patch> [--dry-run]'
  );
  process.exit(1);
}

/**
 * Parse version string into components
 */
function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

/**
 * Bump version based on type
 */
function bumpVersion(version, type) {
  const { major, minor, patch } = parseVersion(version);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}`);
  }
}

try {
  // Read Cargo.toml
  const cargoTomlPath = './Cargo.toml';
  let cargoToml = readFileSync(cargoTomlPath, 'utf8');

  // Extract current version
  const match = cargoToml.match(/^version = "([^"]+)"/m);
  if (!match) {
    console.error('Could not find version in Cargo.toml');
    process.exit(1);
  }

  const oldVersion = match[1];
  const newVersion = bumpVersion(oldVersion, bumpType);

  console.log(`Current version: ${oldVersion}`);
  console.log(`New version: ${newVersion}`);
  console.log(`Bump type: ${bumpType}`);

  if (dryRun) {
    console.log('\nDry run - no changes made');
  } else {
    // Update version in Cargo.toml
    cargoToml = cargoToml.replace(
      /^version = "[^"]+"/m,
      `version = "${newVersion}"`
    );
    writeFileSync(cargoTomlPath, cargoToml);
    console.log(`\n\u2705 Updated ${cargoTomlPath}`);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
