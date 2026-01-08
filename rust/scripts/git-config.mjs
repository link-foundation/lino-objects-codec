#!/usr/bin/env node

/**
 * Configure git user for CI/CD pipeline
 *
 * This script sets up the git user name and email for automated commits.
 * It's used by the CI/CD pipeline before making commits.
 *
 * Usage: node scripts/git-config.mjs [--name <name>] [--email <email>]
 */

import { execSync } from 'child_process';

// Default values
const name = process.env.GIT_USER_NAME || 'github-actions[bot]';
const email = process.env.GIT_USER_EMAIL || 'github-actions[bot]@users.noreply.github.com';

/**
 * Execute a shell command
 * @param {string} command - The command to execute
 */
function exec(command) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

try {
  console.log(`Configuring git user: ${name} <${email}>`);

  exec(`git config user.name "${name}"`);
  exec(`git config user.email "${email}"`);

  console.log('Git configuration complete');
} catch (error) {
  console.error('Error configuring git:', error.message);
  process.exit(1);
}
