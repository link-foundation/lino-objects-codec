#!/usr/bin/env node

/**
 * Version Rust package and commit to main
 * Usage: node scripts/version-and-commit.mjs --bump-type <type> [--description <desc>]
 *   bump-type: Version bump type (patch|minor|major)
 *   description: Optional description for the release
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync, writeFileSync, appendFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

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
      .option('bump-type', {
        type: 'string',
        default: getenv('BUMP_TYPE', ''),
        describe: 'Version bump type: major, minor, or patch',
        choices: ['major', 'minor', 'patch'],
      })
      .option('description', {
        type: 'string',
        default: getenv('DESCRIPTION', ''),
        describe: 'Description for version bump',
      }),
});

const { bumpType, description } = config;

// Validation: Ensure bump type is provided
if (!bumpType) {
  console.error('Error: --bump-type is required');
  console.error(
    'Usage: node scripts/version-and-commit.mjs --bump-type <major|minor|patch> [--description <desc>]'
  );
  process.exit(1);
}

/**
 * Append to GitHub Actions output file
 */
function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
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

/**
 * Get version from Cargo.toml
 */
function getVersion() {
  const cargoToml = readFileSync('./Cargo.toml', 'utf8');
  const match = cargoToml.match(/^version = "([^"]+)"/m);
  if (!match) {
    throw new Error('Could not find version in Cargo.toml');
  }
  return match[1];
}

/**
 * Set version in Cargo.toml
 */
function setVersion(version) {
  let cargoToml = readFileSync('./Cargo.toml', 'utf8');
  cargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${version}"`);
  writeFileSync('./Cargo.toml', cargoToml);
}

/**
 * Get changelog fragments from changelog.d
 */
function getChangelogFragments() {
  const changelogDir = './changelog.d';
  try {
    const files = readdirSync(changelogDir);
    return files
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => ({
        path: join(changelogDir, f),
        content: readFileSync(join(changelogDir, f), 'utf8'),
      }));
  } catch {
    return [];
  }
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

/**
 * Get highest bump type from fragments
 */
function getHighestBumpType(fragments) {
  const priority = { patch: 1, minor: 2, major: 3 };
  let highest = 'patch';
  for (const fragment of fragments) {
    const { frontmatter } = parseFrontmatter(fragment.content);
    const bump = frontmatter.bump || 'patch';
    if ((priority[bump] || 0) > priority[highest]) {
      highest = bump;
    }
  }
  return highest;
}

/**
 * Collect changelog fragments into CHANGELOG.md
 */
function collectChangelog(version, fragments) {
  if (fragments.length === 0) {
    return;
  }

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

  // Delete processed fragments
  for (const fragment of fragments) {
    unlinkSync(fragment.path);
  }
}

async function main() {
  try {
    // Configure git
    await $`git config user.name "github-actions[bot]"`;
    await $`git config user.email "github-actions[bot]@users.noreply.github.com"`;

    // Check if remote main has advanced (handles re-runs after partial success)
    console.log('Checking for remote changes...');
    await $`git fetch origin main`;

    const localHeadResult = await $`git rev-parse HEAD`.run({ capture: true });
    const localHead = localHeadResult.stdout.trim();

    const remoteHeadResult = await $`git rev-parse origin/main`.run({
      capture: true,
    });
    const remoteHead = remoteHeadResult.stdout.trim();

    if (localHead !== remoteHead) {
      console.log(
        `Remote main has advanced (local: ${localHead}, remote: ${remoteHead})`
      );
      console.log('This may indicate a previous attempt partially succeeded.');

      // Get the remote Cargo.toml version
      const remoteCargoResult = await $`git show origin/main:rust/Cargo.toml`.run({
        capture: true,
      });
      const remoteVersionMatch = remoteCargoResult.stdout.match(
        /^version = "([^"]+)"/m
      );
      const remoteVersion = remoteVersionMatch ? remoteVersionMatch[1] : null;

      console.log(`Remote version: ${remoteVersion}`);

      // Check if there are changelog fragments to process
      const fragments = getChangelogFragments();

      if (fragments.length === 0) {
        console.log('No changelog fragments to process and remote has advanced.');
        console.log(
          'Assuming version bump was already completed in a previous attempt.'
        );
        setOutput('version_committed', 'false');
        setOutput('already_released', 'true');
        setOutput('new_version', remoteVersion);
        return;
      } else {
        console.log('Rebasing on remote main to incorporate changes...');
        await $`git rebase origin/main`;
      }
    }

    // Get current version before bump
    const oldVersion = getVersion();
    console.log(`Current version: ${oldVersion}`);

    // Get changelog fragments and determine bump type
    const fragments = getChangelogFragments();
    let effectiveBumpType = bumpType;

    if (fragments.length > 0) {
      const fragmentBumpType = getHighestBumpType(fragments);
      console.log(`Bump type from fragments: ${fragmentBumpType}`);
      // Use the higher of the two bump types
      const priority = { patch: 1, minor: 2, major: 3 };
      if (priority[fragmentBumpType] > priority[bumpType]) {
        effectiveBumpType = fragmentBumpType;
        console.log(`Using fragment bump type: ${effectiveBumpType}`);
      }
    }

    // Calculate new version
    const newVersion = bumpVersion(oldVersion, effectiveBumpType);
    console.log(`New version: ${newVersion}`);

    // Update Cargo.toml
    setVersion(newVersion);
    console.log('Updated Cargo.toml');

    // Update Cargo.lock
    await $`cargo update --package lino-objects-codec`;
    console.log('Updated Cargo.lock');

    // Collect changelog fragments
    if (fragments.length > 0) {
      collectChangelog(newVersion, fragments);
      console.log('Collected changelog fragments');
    } else if (description) {
      // Add manual description to changelog
      const date = new Date().toISOString().split('T')[0];
      const newEntry = `## [${newVersion}] - ${date}\n\n${description}`;
      let changelog = '';
      try {
        changelog = readFileSync('./CHANGELOG.md', 'utf8');
      } catch {
        changelog = '# Changelog\n\n';
      }
      const unreleasedMatch = changelog.match(/## \[Unreleased\][^\n]*\n/);
      if (unreleasedMatch) {
        const insertPos = unreleasedMatch.index + unreleasedMatch[0].length;
        changelog =
          changelog.slice(0, insertPos) + '\n' + newEntry + '\n' + changelog.slice(insertPos);
      } else {
        const headerMatch = changelog.match(/# Changelog[^\n]*\n/);
        if (headerMatch) {
          const insertPos = headerMatch.index + headerMatch[0].length;
          changelog =
            changelog.slice(0, insertPos) + '\n' + newEntry + '\n\n' + changelog.slice(insertPos);
        }
      }
      writeFileSync('./CHANGELOG.md', changelog);
      console.log('Updated CHANGELOG.md with description');
    }

    setOutput('new_version', newVersion);

    // Check if there are changes to commit
    const statusResult = await $`git status --porcelain`.run({ capture: true });
    const status = statusResult.stdout.trim();

    if (status) {
      console.log('Changes detected, committing...');

      // Stage all changes
      await $`git add -A`;

      // Commit with version number as message
      const commitMessage = `rust-v${newVersion}`;
      await $`git commit -m "${commitMessage}"`;

      // Push directly to main
      await $`git push origin main`;

      console.log('\u2705 Version bump committed and pushed to main');
      setOutput('version_committed', 'true');
    } else {
      console.log('No changes to commit');
      setOutput('version_committed', 'false');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
