#!/usr/bin/env node

/**
 * Decide whether the Rust package should be released.
 *
 * The registry is the source of truth. A 200 from crates.io means the current
 * Cargo.toml version already exists, a 404 means it does not, and every other
 * response is ambiguous enough to fail the workflow.
 */

import { appendFileSync, readFileSync } from 'fs';

import {
  decideRustRelease,
  parseCratesVersionResponse,
} from './crates-release-helpers.mjs';

const USER_AGENT =
  'link-foundation-lino-objects-codec-ci (https://github.com/link-foundation/lino-objects-codec)';

function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

function getCargoPackage() {
  const cargoToml = readFileSync('./Cargo.toml', 'utf8');
  const nameMatch = cargoToml.match(/^name = "([^"]+)"/m);
  const versionMatch = cargoToml.match(/^version = "([^"]+)"/m);

  if (!nameMatch || !versionMatch) {
    throw new Error('Could not read package name and version from Cargo.toml');
  }

  return {
    name: nameMatch[1],
    version: versionMatch[1],
  };
}

async function fetchCratesVersion(packageName, version) {
  const url = `https://crates.io/api/v1/crates/${packageName}/${version}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

async function main() {
  try {
    const { name, version } = getCargoPackage();
    const hasFragments = process.env.HAS_FRAGMENTS === 'true';

    setOutput('package_name', name);
    setOutput('current_version', version);

    const probe = await fetchCratesVersion(name, version);
    console.log(
      `crates.io HTTP status for ${name}@${version}: ${probe.status}`
    );

    const currentVersionPublished = parseCratesVersionResponse(probe);
    const decision = decideRustRelease({
      hasFragments,
      currentVersionPublished,
    });

    console.log(`has_fragments=${hasFragments}`);
    console.log(`current_version_published=${currentVersionPublished}`);
    console.log(`should_release=${decision.shouldRelease}`);
    console.log(`skip_bump=${decision.skipBump}`);
    console.log(`release_reason=${decision.reason}`);

    setOutput('current_version_published', String(currentVersionPublished));
    setOutput('should_release', String(decision.shouldRelease));
    setOutput('skip_bump', String(decision.skipBump));
    setOutput('release_reason', decision.reason);
  } catch (error) {
    console.error(
      `::error title=crates.io release probe failed::${error.message}`
    );
    process.exit(1);
  }
}

main();
