#!/usr/bin/env node

/**
 * Get the highest bump type from changelog fragments
 * Usage: node scripts/get-bump-type.mjs
 *
 * Outputs the bump type to GITHUB_OUTPUT if running in GitHub Actions
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 */

import { readFileSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';

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
 * Set GitHub Actions output
 */
function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

try {
  // Get changelog fragments
  const changelogDir = './changelog.d';
  let files;
  try {
    files = readdirSync(changelogDir);
  } catch {
    console.log('No changelog.d directory found');
    console.log('bump_type=patch');
    setOutput('bump_type', 'patch');
    process.exit(0);
  }

  const fragments = files
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => readFileSync(join(changelogDir, f), 'utf8'));

  if (fragments.length === 0) {
    console.log('No changelog fragments found');
    console.log('bump_type=patch');
    setOutput('bump_type', 'patch');
    process.exit(0);
  }

  // Get highest bump type
  const priority = { patch: 1, minor: 2, major: 3 };
  let highest = 'patch';

  for (const content of fragments) {
    const { frontmatter } = parseFrontmatter(content);
    const bump = frontmatter.bump || 'patch';
    if ((priority[bump] || 0) > priority[highest]) {
      highest = bump;
    }
  }

  console.log(`Found ${fragments.length} fragment(s)`);
  console.log(`Highest bump type: ${highest}`);
  console.log(`bump_type=${highest}`);
  setOutput('bump_type', highest);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
