#!/usr/bin/env node

/**
 * Publish to npm using OIDC trusted publishing
 * Usage: node scripts/publish-to-npm.mjs [--should-pull]
 *   should_pull: Optional flag to pull latest changes before publishing (for release job)
 *
 * Reads name and version dynamically from ./package.json so the script does not
 * need to be edited when the package is renamed.
 *
 * Multi-layer publish failure detection (port of link-assistant/agent PR #116):
 *   1. Capture stdout/stderr from `npm run changeset:publish` and scan for failure
 *      markers like "packages failed to publish", "error occurred while publishing",
 *      and standard npm error codes. `@changesets/cli` prints these markers and
 *      keeps exit code 0, so without this scan a logical failure shows as success.
 *   2. Re-check the registry with `npm view <name>@<version>` after publish to
 *      confirm the version actually exists.
 *   3. Surface ::error:: directives with credential-recovery hints when
 *      authentication failures are detected.
 *
 * See: docs/case-studies/issue-29/README.md for the full story.
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync, appendFileSync } from 'fs';

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
    yargs.option('should-pull', {
      type: 'boolean',
      default: getenv('SHOULD_PULL', false),
      describe: 'Pull latest changes before publishing',
    }),
});

const { shouldPull } = config;
const MAX_RETRIES = 3;
const RETRY_DELAY = 10000; // 10 seconds

// Patterns that indicate publish failure in changeset output.
// `@changesets/cli` exits 0 even when individual packages fail; these are the
// stable markers it prints in that case, plus the standard npm error code lines.
const FAILURE_PATTERNS = [
  'packages failed to publish',
  'error occurred while publishing',
  'npm error code E',
  'npm error 404',
  'npm error 401',
  'npm error 403',
  'access token expired',
  'eneedauth',
];

// Patterns that specifically indicate a credentials problem. When matched, the
// script prints an actionable runbook to the GitHub Actions log so the operator
// does not need to dig through the case-study folder.
const CREDENTIAL_FAILURE_PATTERNS = [
  'npm error 401',
  'npm error 403',
  'access token expired',
  'eneedauth',
  'unable to authenticate',
  'oidc id token exchange failed',
];

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

/**
 * Lowercase scan for any of the supplied patterns.
 * @param {string} output
 * @param {string[]} patterns
 * @returns {string|null}
 */
function findFailurePattern(output, patterns) {
  const lowerOutput = output.toLowerCase();
  for (const pattern of patterns) {
    if (lowerOutput.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

/**
 * Print a credential-recovery runbook to GitHub Actions logs.
 */
function printCredentialRunbook() {
  console.error(
    '::error title=npm credentials problem::npm publish failed with an authentication error.'
  );
  console.error('');
  console.error('How to fix:');
  console.error(
    '  1. This workflow uses npm OIDC trusted publishing - no NPM_TOKEN secret is required,'
  );
  console.error(
    '     but the package on npm must list this GitHub repository as a trusted publisher.'
  );
  console.error(
    '     Configure it at: https://www.npmjs.com/package/<package-name>/access'
  );
  console.error(
    '     Docs: https://docs.npmjs.com/trusted-publishers'
  );
  console.error('');
  console.error(
    '  2. Verify the workflow has `permissions: id-token: write` (see .github/workflows/js.yml).'
  );
  console.error('');
  console.error(
    '  3. If you are using a legacy NPM_TOKEN secret, rotate it at:'
  );
  console.error(
    '     GitHub repo -> Settings -> Secrets and variables -> Actions -> NPM_TOKEN.'
  );
  console.error(
    '     Generate a new token at https://www.npmjs.com/settings/<user>/tokens with publish scope.'
  );
  console.error('');
  console.error(
    '  4. See docs/case-studies/issue-29/README.md for the full investigation.'
  );
}

/**
 * Verify that a package version is published on npm
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<boolean>}
 */
async function verifyPublished(packageName, version) {
  const result = await $`npm view "${packageName}@${version}" version`.run({
    capture: true,
  });
  return result.code === 0 && result.stdout.trim().includes(version);
}

/**
 * Append to GitHub Actions output file
 * @param {string} key
 * @param {string} value
 */
function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

/**
 * Run changeset:publish and capture stdout/stderr.
 * @returns {Promise<{result: object|null, error: Error|null}>}
 */
async function runChangesetPublish() {
  try {
    const result = await $`npm run changeset:publish`.run({ capture: true });
    return { result, error: null };
  } catch (error) {
    return { result: null, error };
  }
}

/**
 * Examine the captured publish output to decide whether the run actually
 * succeeded. Returns null on success or an Error describing the failure.
 * @param {object|null} publishResult
 * @param {Error|null} commandError
 * @returns {Error|null}
 */
function analyzePublishResult(publishResult, commandError) {
  const combinedOutput = publishResult
    ? `${publishResult.stdout || ''}\n${publishResult.stderr || ''}`
    : '';

  if (combinedOutput.trim()) {
    console.log('Changeset output:');
    console.log(combinedOutput);
  }

  if (commandError) {
    return commandError;
  }

  const failurePattern = findFailurePattern(combinedOutput, FAILURE_PATTERNS);
  if (failurePattern) {
    if (findFailurePattern(combinedOutput, CREDENTIAL_FAILURE_PATTERNS)) {
      printCredentialRunbook();
    }
    return new Error(
      `Publish failed: detected "${failurePattern}" in changeset output`
    );
  }

  if (publishResult && publishResult.code !== 0) {
    return new Error(`Publish failed with exit code ${publishResult.code}`);
  }

  return null;
}

/**
 * Single publish attempt: run changeset, scan output, then re-query the
 * registry to make absolutely sure the version is there.
 * @param {string} packageName
 * @param {string} currentVersion
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
async function attemptPublish(packageName, currentVersion) {
  const { result, error } = await runChangesetPublish();
  const analysisError = analyzePublishResult(result, error);
  if (analysisError) {
    return { success: false, error: analysisError };
  }

  // Allow npm registry caches a moment to propagate
  console.log('Verifying package was published to npm...');
  await sleep(2000);
  const isPublished = await verifyPublished(packageName, currentVersion);
  if (isPublished) {
    return { success: true, error: null };
  }

  console.error(
    `::error title=npm publish verification failed::${packageName}@${currentVersion} is not on npm after publish.`
  );
  return {
    success: false,
    error: new Error(
      `Package ${packageName}@${currentVersion} not found on npm after publish attempt`
    ),
  };
}

async function main() {
  try {
    if (shouldPull) {
      // Pull the latest changes we just pushed
      await $`git pull origin main`;
    }

    // Read name and version dynamically from package.json - never trust a hardcoded constant
    // (this is the bug that produced the v0.3.3 false-positive; see
    // docs/case-studies/issue-29/README.md).
    const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
    const packageName = packageJson.name;
    const currentVersion = packageJson.version;

    if (!packageName || !currentVersion) {
      console.error(
        '::error::package.json is missing required "name" or "version" fields.'
      );
      process.exit(1);
    }

    console.log(`Package to publish: ${packageName}`);
    console.log(`Current version to publish: ${currentVersion}`);

    // Check if this version is already published on npm
    console.log(
      `Checking if version ${currentVersion} is already published...`
    );
    const checkResult = await $`npm view "${packageName}@${currentVersion}" version`.run(
      { capture: true }
    );

    // command-stream returns { code: 0 } on success, { code: 1 } on failure (e.g., E404)
    // Exit code 0 means version exists, non-zero means version not found
    if (checkResult.code === 0) {
      console.log(`Version ${currentVersion} is already published to npm`);
      setOutput('published', 'true');
      setOutput('published_version', currentVersion);
      setOutput('already_published', 'true');
      return;
    }

    // Version not found on npm (E404), proceed with publish
    console.log(
      `Version ${currentVersion} not found on npm, proceeding with publish...`
    );

    // Publish to npm using OIDC trusted publishing with retry logic
    // Multi-layer failure detection based on link-assistant/agent PR #116 (see file header).
    for (let i = 1; i <= MAX_RETRIES; i++) {
      console.log(`Publish attempt ${i} of ${MAX_RETRIES}...`);
      const { success, error } = await attemptPublish(
        packageName,
        currentVersion
      );

      if (success) {
        setOutput('published', 'true');
        setOutput('published_version', currentVersion);
        console.log(`✅ Published ${packageName}@${currentVersion} to npm`);
        return;
      }

      if (i < MAX_RETRIES) {
        console.log(
          `Publish failed: ${error.message}, waiting ${RETRY_DELAY / 1000}s before retry...`
        );
        await sleep(RETRY_DELAY);
      }
    }

    console.error(
      `::error title=npm publish failed::${MAX_RETRIES} attempts exhausted; ${packageName}@${currentVersion} was not published.`
    );
    console.error(
      'See docs/case-studies/issue-29/README.md for the runbook.'
    );
    process.exit(1);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
