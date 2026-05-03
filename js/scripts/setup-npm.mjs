#!/usr/bin/env node

/**
 * Update npm for OIDC trusted publishing.
 * npm trusted publishing requires npm >= 11.5.1 and Node.js >= 22.14.0.
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 */

import { dirname } from 'node:path';

import {
  MINIMUM_NODE_VERSION,
  MINIMUM_NPM_VERSION,
  TRUSTED_PUBLISHING_NPM_MAJOR,
  isVersionAtLeast,
  selectLatestSatisfyingMajor,
} from './npm-version-helpers.mjs';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import command-stream for shell command execution
const { $ } = await use('command-stream');

async function runChecked(command, label) {
  const result = await command.run({ capture: true });
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();
  if (output) {
    console.log(output);
  }
  if (result.code && result.code !== 0) {
    throw new Error(`${label} exited with code ${result.code}`);
  }
  return result;
}

async function getNpmVersion() {
  const result = await runChecked($`npm --version`, 'npm --version');
  return result.stdout.trim();
}

async function installWithNpm() {
  await runChecked(
    $`npm install -g npm@${TRUSTED_PUBLISHING_NPM_MAJOR}`,
    `npm install -g npm@${TRUSTED_PUBLISHING_NPM_MAJOR}`
  );
}

async function resolveNpmTarball() {
  const response = await fetch('https://registry.npmjs.org/npm');
  if (!response.ok) {
    throw new Error(`npm registry metadata returned HTTP ${response.status}`);
  }

  const metadata = await response.json();
  const version = selectLatestSatisfyingMajor({
    versions: Object.keys(metadata.versions || {}),
    major: TRUSTED_PUBLISHING_NPM_MAJOR,
    minimum: MINIMUM_NPM_VERSION,
  });

  if (!version) {
    throw new Error(
      `Could not find npm ${TRUSTED_PUBLISHING_NPM_MAJOR}.x >= ${MINIMUM_NPM_VERSION}`
    );
  }

  const tarball = metadata.versions[version]?.dist?.tarball;
  if (!tarball) {
    throw new Error(`npm ${version} metadata does not include a tarball URL`);
  }

  return { version, tarball };
}

async function installWithTarball() {
  const { version, tarball } = await resolveNpmTarball();
  const nodePrefix = dirname(dirname(process.execPath));
  const globalNodeModulesDir = `${nodePrefix}/lib/node_modules`;
  const globalNpmDir = `${nodePrefix}/lib/node_modules/npm`;
  const tempDir = `/tmp/npm-${version}-${process.pid}`;
  const archivePath = `${tempDir}/npm.tgz`;

  console.log(`Installing npm ${version} from registry tarball...`);
  await runChecked($`rm -rf "${tempDir}"`, 'remove npm temp dir');
  await runChecked($`mkdir -p "${tempDir}"`, 'create npm temp dir');
  await runChecked(
    $`curl -fsSL "${tarball}" -o "${archivePath}"`,
    `download npm ${version}`
  );
  await runChecked(
    $`tar xzf "${archivePath}" -C "${tempDir}"`,
    `extract npm ${version}`
  );
  await runChecked(
    $`mkdir -p "${globalNodeModulesDir}"`,
    'create global node_modules dir'
  );
  await runChecked($`rm -rf "${globalNpmDir}"`, 'remove old global npm');
  await runChecked(
    $`mv "${tempDir}/package" "${globalNpmDir}"`,
    `install npm ${version} tarball`
  );
  await runChecked($`rm -rf "${tempDir}"`, 'clean npm temp dir');
}

async function installWithNpx() {
  await runChecked(
    $`npx --yes npm@${TRUSTED_PUBLISHING_NPM_MAJOR} install -g npm@${TRUSTED_PUBLISHING_NPM_MAJOR}`,
    `npx npm@${TRUSTED_PUBLISHING_NPM_MAJOR} install`
  );
}

async function tryStrategy(name, fn) {
  try {
    console.log(`Trying ${name}...`);
    await fn();
    return true;
  } catch (error) {
    console.warn(`Warning: ${name} failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    const nodeVersion = process.version.replace(/^v/, '');
    if (!isVersionAtLeast(nodeVersion, MINIMUM_NODE_VERSION)) {
      console.error(
        `ERROR: npm trusted publishing requires Node.js >= ${MINIMUM_NODE_VERSION}; current Node.js is ${nodeVersion}.`
      );
      process.exit(1);
    }

    const currentVersion = await getNpmVersion();
    console.log(`Current npm version: ${currentVersion}`);

    if (!isVersionAtLeast(currentVersion, MINIMUM_NPM_VERSION)) {
      const strategies = [
        [`npm install -g npm@${TRUSTED_PUBLISHING_NPM_MAJOR}`, installWithNpm],
        ['registry tarball fallback', installWithTarball],
        [`npx npm@${TRUSTED_PUBLISHING_NPM_MAJOR} fallback`, installWithNpx],
      ];

      let installed = false;
      for (const [name, fn] of strategies) {
        installed = await tryStrategy(name, fn);
        if (installed) {
          break;
        }
      }

      if (!installed) {
        console.error(
          `ERROR: Could not update npm to >= ${MINIMUM_NPM_VERSION} for OIDC trusted publishing.`
        );
        process.exit(1);
      }
    }

    const updatedVersion = await getNpmVersion();
    console.log(`Updated npm version: ${updatedVersion}`);

    if (!isVersionAtLeast(updatedVersion, MINIMUM_NPM_VERSION)) {
      console.error(
        `ERROR: npm is still ${updatedVersion}; trusted publishing requires >= ${MINIMUM_NPM_VERSION}.`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('Error updating npm:', error.message);
    process.exit(1);
  }
}

main();
