#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UPSTREAM = 'https://github.com/npm/cli/issues/10299';
const ADVISORIES = new Map([
  ['glob', 'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4'],
  ['minimatch', 'https://github.com/advisories/GHSA-g3hv-75wg-m249'],
]);

export const MANUAL_ACTION = `npm maintainers must publish a CLI with patched bundled glob/minimatch (${UPSTREAM}). A repository maintainer must then update npm in package.json, js/package.json, js/scripts/npm-version-helpers.mjs and package-lock.json, remove this temporary deferral, and re-run Security. No repository secret or permission can repair the published bundle.`;

/** Only the recorded advisories in the exact official npm bundle qualify. */
export function isKnownNpmBundleReport(report, lock) {
  const npm = lock?.packages?.['node_modules/npm'];
  if (
    npm?.version !== '12.2.2' ||
    npm.resolved !== 'https://registry.npmjs.org/npm/-/npm-12.2.2.tgz'
  )
    return false;
  for (const [name, version] of [
    ['glob', '13.0.6'],
    ['minimatch', '10.2.5'],
  ]) {
    const entry = lock.packages[`node_modules/npm/node_modules/${name}`];
    if (entry?.version !== version || entry.inBundle !== true) return false;
  }
  const findings = Object.values(report.vulnerabilities ?? {});
  if (
    report.error ||
    report.auditReportVersion !== 2 ||
    !findings.length ||
    report.metadata?.vulnerabilities?.total !== findings.length
  )
    return false;
  const seen = new Set();
  for (const finding of findings) {
    if (
      !finding ||
      finding.severity !== 'moderate' ||
      !Array.isArray(finding.nodes) ||
      !Array.isArray(finding.via) ||
      !finding.nodes?.length ||
      !finding.via?.length
    )
      return false;
    if (
      !finding.nodes.every(
        (path) =>
          typeof path === 'string' &&
          (path === 'node_modules/npm' ||
            path.startsWith('node_modules/npm/')) &&
          lock.packages[path]
      )
    )
      return false;
    for (const via of finding.via) {
      if (typeof via === 'string') {
        if (!report.vulnerabilities[via]) return false;
      } else {
        if (!via || ADVISORIES.get(via.name) !== via.url) return false;
        const expected = `node_modules/npm/node_modules/${via.name}`;
        if (!finding.nodes.every((path) => path === expected)) return false;
        seen.add(via.url);
      }
    }
  }
  return seen.size === ADVISORIES.size;
}

/** Audit both trees even if one fails. Registry/CLI errors always fail closed. */
export function auditNpmLocks({
  eventName = process.env.GITHUB_EVENT_NAME,
  root = ROOT,
  run = (cwd) =>
    spawnSync(
      process.execPath,
      [
        join(ROOT, 'node_modules/npm/bin/npm-cli.js'),
        'audit',
        '--package-lock-only',
        '--json',
      ],
      { cwd, encoding: 'utf8' }
    ),
  readLock = (path) => JSON.parse(readFileSync(path, 'utf8')),
  log = console.log,
  summary = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  let failed = false;
  for (const relative of ['package-lock.json', 'js/package-lock.json']) {
    const lockPath = join(root, relative);
    const result = run(dirname(lockPath));
    log(`Audit ${relative}`);
    if (result.stdout) log(result.stdout);
    if (result.stderr) log(result.stderr);
    let report;
    try {
      report = JSON.parse(result.stdout);
      if (
        report.error ||
        report.auditReportVersion !== 2 ||
        !report.vulnerabilities ||
        typeof report.vulnerabilities !== 'object' ||
        Array.isArray(report.vulnerabilities) ||
        !Number.isInteger(report.metadata?.vulnerabilities?.total)
      )
        throw new Error('Incomplete npm audit report');
    } catch {
      log(
        `::error::${relative}: npm audit did not return a complete advisory report.`
      );
      failed = true;
      continue;
    }
    if (
      !result.error &&
      result.status === 0 &&
      report.metadata.vulnerabilities.total === 0 &&
      Object.keys(report.vulnerabilities).length === 0
    )
      continue;
    let knownBundle = false;
    try {
      knownBundle =
        !result.error &&
        result.status === 1 &&
        relative === 'package-lock.json' &&
        isKnownNpmBundleReport(report, readLock(lockPath));
    } catch {
      // An unreadable/malformed lock cannot qualify; still audit the next tree.
    }
    if (knownBundle && eventName === 'pull_request') {
      const message = `PR-only deferral: npm 12.2.2's bundled glob/minimatch advisories remain UNRESOLVED. Skipping enforcement only for these two upstream advisories and their npm-internal propagation. ${MANUAL_ACTION}`;
      log(`::warning::${message}`);
      if (summary)
        appendFileSync(
          summary,
          `\n${message}\n\n${[...ADVISORIES.values()].join('\n\n')}\n`
        );
    } else {
      log(
        `::error::${relative}: ${knownBundle ? MANUAL_ACTION : 'Resolve every advisory or audit error. Only the two recorded npm bundle advisories may be deferred on pull_request events.'}`
      );
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = auditNpmLocks();
}
