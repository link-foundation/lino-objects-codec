#!/usr/bin/env node

/**
 * Configure git user for CI/CD pipeline
 *
 * This script sets up the git user name and email for automated commits.
 * It's used by the CI/CD pipeline before making commits.
 *
 * Usage: node scripts/git-config.mjs [--name <name>] [--email <email>]
 */

import { execFileSync } from 'node:child_process';

// Default values
const name = process.env.GIT_USER_NAME || 'github-actions[bot]';
const email =
  process.env.GIT_USER_EMAIL || 'github-actions[bot]@users.noreply.github.com';

/**
 * Configure one value without shell interpolation or logging personal data.
 */
function configure(key, value) {
  try {
    execFileSync('git', ['config', key, value], { stdio: 'pipe' });
  } catch {
    console.error(`Could not configure git ${key}`);
    process.exit(1);
  }
}

try {
  configure('user.name', name);
  configure('user.email', email);

  console.log('Git configuration complete');
} catch (error) {
  console.error('Error configuring git:', error.message);
  process.exit(1);
}
