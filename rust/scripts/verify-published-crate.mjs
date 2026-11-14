#!/usr/bin/env node

/**
 * Verify what crates.io actually serves for a freshly published version.
 *
 * Issue #84: the repository had moved to `links-notation` 0.31 while crates.io
 * still served 0.9.3, which requires `links-notation ^0.27.1`. Consumers could
 * not adopt the current grammar, and nothing in the release pipeline compared
 * the registry artifact with the source. `wait-for-registry.mjs` only proves
 * that *a* version with the right number exists.
 *
 * This script runs after the version is visible and checks two things:
 *
 *   1. Registry metadata: `GET /api/v1/crates/<name>/<version>/dependencies`
 *      must list exactly the dependencies of `Cargo.toml`, with the same
 *      requirements (`0.31.4` in the manifest is `^0.31.4` on the registry) and
 *      the same `optional` flags.
 *   2. Consumer smoke test (`--consumer`): a fresh crate that depends on
 *      `<name> = "=<version>"` from crates.io is built and run. It round-trips
 *      a value through `encode`/`decode`, and `cargo tree` must resolve every
 *      normal dependency to a version that satisfies the manifest requirement.
 *      This is the reproduction from issue #84, run against the real artifact.
 *
 * Usage:
 *   node scripts/verify-published-crate.mjs [--manifest Cargo.toml]
 *     [--version 0.9.4] [--consumer] [--max-attempts 10] [--delay-seconds 15]
 *     [--verbose]
 *
 * Environment overrides (tests, debugging): CRATES_API_BASE_URL,
 * VERIFY_PUBLISHED_VERBOSE=1.
 *
 * Exit code 0 means everything matched; 1 lists every mismatch.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  compareDependencies,
  parseCargoTree,
  parseCratesDependenciesResponse,
  parseManifestDependencies,
  satisfiesCaret,
} from './crates-release-helpers.mjs';

const USER_AGENT =
  'lino-objects-codec-ci (+https://github.com/link-foundation/lino-objects-codec)';

function parseArgs(argv) {
  const options = {
    manifest: 'Cargo.toml',
    version: null,
    consumer: false,
    maxAttempts: 10,
    delaySeconds: 15,
    verbose: process.env.VERIFY_PUBLISHED_VERBOSE === '1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`${arg} needs a value`);
      }
      return argv[i];
    };
    if (arg === '--manifest') options.manifest = next();
    else if (arg === '--version') options.version = next();
    else if (arg === '--consumer') options.consumer = true;
    else if (arg === '--max-attempts') options.maxAttempts = Number(next());
    else if (arg === '--delay-seconds') options.delaySeconds = Number(next());
    else if (arg === '--verbose') options.verbose = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const sleep = (seconds) =>
  new Promise((done) => setTimeout(done, seconds * 1000));

async function retry(label, options, action) {
  let lastError;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (options.verbose) {
        console.log(`${label}: attempt ${attempt} failed: ${error.message}`);
      }
      if (attempt < options.maxAttempts) {
        await sleep(options.delaySeconds);
      }
    }
  }
  throw lastError;
}

async function fetchRegistryDependencies(name, version) {
  const base = process.env.CRATES_API_BASE_URL || 'https://crates.io/api/v1';
  const url = `${base}/crates/${name}/${version}/dependencies`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  return parseCratesDependenciesResponse({
    status: response.status,
    body: await response.text(),
  });
}

function cargo(args, cwd, verbose) {
  return execFileSync('cargo', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', verbose ? 'inherit' : 'pipe'],
  });
}

function consumerSource(crateIdent) {
  return `use ${crateIdent}::{LinoValue, decode, encode};

fn main() {
    let value = LinoValue::object([
        ("name", LinoValue::String("published crate".to_string())),
        ("count", LinoValue::Int(3)),
        ("items", LinoValue::Array(vec![LinoValue::Bool(true), LinoValue::Null])),
    ]);
    let encoded = encode(&value);
    let decoded = decode(&encoded).expect("the published codec must decode its own output");
    assert_eq!(decoded, value, "round trip changed the value:\\n{encoded}");
    println!("round trip ok");
}
`;
}

function runConsumer(name, version, manifestDeps, options) {
  const dir = mkdtempSync(join(tmpdir(), 'published-crate-consumer-'));
  const problems = [];
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'Cargo.toml'),
      `[package]\nname = "published-crate-consumer"\nversion = "0.0.0"\nedition = "2021"\npublish = false\n\n[dependencies]\n${name} = "=${version}"\n`
    );
    writeFileSync(
      join(dir, 'src', 'main.rs'),
      consumerSource(name.replace(/-/g, '_'))
    );
    const output = cargo(['run', '--quiet'], dir, options.verbose);
    if (!output.includes('round trip ok')) {
      problems.push(`consumer round trip printed: ${output.trim()}`);
    }
    const tree = parseCargoTree(
      cargo(
        [
          'tree',
          '-p',
          name,
          '-e',
          'normal',
          '--depth',
          '1',
          '--prefix',
          'none',
        ],
        dir,
        options.verbose
      )
    );
    if (tree.get(name) !== version) {
      problems.push(
        `consumer resolved ${name} ${tree.get(name)}, expected ${version}`
      );
    }
    for (const dep of manifestDeps) {
      if (dep.kind !== 'normal' || dep.optional) continue;
      const resolved = tree.get(dep.name);
      if (!resolved) {
        problems.push(`consumer did not resolve ${dep.name}`);
      } else if (!satisfiesCaret(resolved, dep.req)) {
        problems.push(
          `consumer resolved ${dep.name} ${resolved}, which does not satisfy ${dep.req} from Cargo.toml`
        );
      } else {
        console.log(
          `consumer resolves ${dep.name} v${resolved} (Cargo.toml: ${dep.req})`
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return problems;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestText = readFileSync(resolve(options.manifest), 'utf8');
  const name = manifestText.match(/^name = "([^"]+)"/m)?.[1];
  const version =
    options.version ?? manifestText.match(/^version = "([^"]+)"/m)?.[1];
  if (!name || !version) {
    throw new Error(`could not read name and version from ${options.manifest}`);
  }
  const manifestDeps = parseManifestDependencies(manifestText);

  const registryDeps = await retry('dependencies', options, () =>
    fetchRegistryDependencies(name, version)
  );
  const problems = compareDependencies(manifestDeps, registryDeps);
  if (problems.length === 0) {
    for (const dep of registryDeps) {
      console.log(
        `crates.io ${name}@${version}: ${dep.name} ${dep.req} (${dep.kind}${dep.optional ? ', optional' : ''})`
      );
    }
  }

  if (options.consumer && problems.length === 0) {
    // The sparse index can lag the API by a little; a failed resolve is retried.
    problems.push(
      ...(await retry('consumer', options, () =>
        runConsumer(name, version, manifestDeps, options)
      ))
    );
  }

  if (problems.length > 0) {
    console.error(
      `::error title=Published crate differs from the source::${name}@${version} on crates.io does not match ${options.manifest}`
    );
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    console.error(
      '\nA crates.io version is immutable: fix the manifest and release a new version.'
    );
    process.exit(1);
  }
  console.log(`${name}@${version} on crates.io matches ${options.manifest}.`);
}

main().catch((error) => {
  console.error(
    `::error title=Published crate verification failed::${error.message}`
  );
  process.exit(1);
});
