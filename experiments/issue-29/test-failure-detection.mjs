#!/usr/bin/env node
/**
 * Reproduces the false-positive detection logic from publish-to-npm.mjs
 * against the actual log lines captured from CI run 25280681547 to prove the
 * detector now flags what was previously missed.
 *
 * Usage: node experiments/issue-29/test-failure-detection.mjs
 */

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

function findFailurePattern(output, patterns) {
  const lowerOutput = output.toLowerCase();
  for (const pattern of patterns) {
    if (lowerOutput.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

// Real captured fragments from docs/case-studies/issue-29/run-25280681547-js.log
const realChangesetOutput = `
🦋  info npm-incremental-publish: Using version registry...
🦋  info lino-objects-codec is being published because our local version (0.3.3) has not been published on npm
🦋  info Publishing "lino-objects-codec" at "0.3.3"
🦋  error an error occurred while publishing lino-objects-codec: E404 Not Found - PUT https://registry.npmjs.org/lino-objects-codec - Not found
🦋  error npm notice
🦋  error npm error code E404
🦋  error npm error 404 Not Found - PUT https://registry.npmjs.org/lino-objects-codec - Not found
🦋  error npm error 404
🦋  error npm error 404  'lino-objects-codec@0.3.3' is not in this registry.
🦋  error packages failed to publish:
🦋  error   - lino-objects-codec
`;

const cleanSuccess = `
🦋  info npm-incremental-publish: Using version registry...
🦋  success Successfully published the following packages:
   - lino-objects-codec@0.3.3
`;

const credentialFailure = `
npm error code E401
npm error 401 Unauthorized
npm error 401 PUT https://registry.npmjs.org/lino-objects-codec
npm error A complete log of this run can be found in: ...
`;

// "expectFailure" is the assertion: a failure SHOULD be detected for these
// fragments. The detector scans patterns in order, so the exact match is
// implementation-detail; the contract is "must report some failure".
const tests = [
  {
    label: 'real CI E404 output (run 25280681547)',
    input: realChangesetOutput,
    expectFailure: true,
  },
  {
    label: 'clean success output',
    input: cleanSuccess,
    expectFailure: false,
  },
  {
    label: 'credential failure E401',
    input: credentialFailure,
    expectFailure: true,
  },
];

let passed = 0;
let failed = 0;
for (const t of tests) {
  const detected = findFailurePattern(t.input, FAILURE_PATTERNS);
  const detectedFailure = detected !== null;
  if (detectedFailure === t.expectFailure) {
    console.log(`PASS ${t.label} -> detected=${detected}`);
    passed++;
  } else {
    console.log(
      `FAIL ${t.label} -> detected=${detected}, expectedFailure=${t.expectFailure}`
    );
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${passed} tests passed`);
