#!/usr/bin/env node

/** Install the current npm CLI, including its native OIDC publishing support. */
import { execSync } from 'node:child_process';
import {
  MINIMUM_NODE_VERSION,
  MINIMUM_NPM_VERSION,
  isVersionAtLeast,
} from './npm-version-helpers.mjs';

if (!isVersionAtLeast(process.version, MINIMUM_NODE_VERSION)) {
  throw new Error(`Node.js >= ${MINIMUM_NODE_VERSION} is required.`);
}

// npm is a .cmd launcher on Windows, so invoke these fixed commands in a shell.
const version = () => execSync('npm --version', { encoding: 'utf8' }).trim();
if (!isVersionAtLeast(version(), MINIMUM_NPM_VERSION)) {
  execSync(`npm install --global npm@${MINIMUM_NPM_VERSION}`, {
    stdio: 'inherit',
  });
}
if (!isVersionAtLeast(version(), MINIMUM_NPM_VERSION)) {
  throw new Error(`npm >= ${MINIMUM_NPM_VERSION} is required.`);
}
console.log(`npm ${version()} supports trusted publishing.`);
