import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNpmLocks,
  isKnownNpmBundleReport,
  MANUAL_ACTION,
} from './audit-npm-locks.mjs';

function fixture() {
  const packages = {
    'node_modules/npm': {
      version: '12.2.2',
      resolved: 'https://registry.npmjs.org/npm/-/npm-12.2.2.tgz',
    },
  };
  const vulnerabilities = {};
  for (const [name, version, id] of [
    ['glob', '13.0.6', 'GHSA-3g3m-2fjr-6pw4'],
    ['minimatch', '10.2.5', 'GHSA-g3hv-75wg-m249'],
  ]) {
    const path = `node_modules/npm/node_modules/${name}`;
    packages[path] = { version, inBundle: true };
    vulnerabilities[name] = {
      name,
      severity: 'moderate',
      nodes: [path],
      via: [{ name, url: `https://github.com/advisories/${id}` }],
    };
  }
  vulnerabilities.npm = {
    name: 'npm',
    severity: 'moderate',
    nodes: ['node_modules/npm'],
    via: ['glob', 'minimatch'],
  };
  return {
    lock: { packages },
    report: {
      auditReportVersion: 2,
      vulnerabilities,
      metadata: { vulnerabilities: { total: 3 } },
    },
  };
}

const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { total: 0 } },
};
const response = (report, status = 1) => ({
  status,
  stdout: JSON.stringify(report),
});

function check(eventName, results, lock = fixture().lock) {
  const messages = [];
  let calls = 0;
  const status = auditNpmLocks({
    // Undefined represents an unset event, regardless of the CI test host.
    eventName: eventName ?? '',
    run: () => results[calls++],
    readLock: () => lock,
    log: (text) => messages.push(text),
    summary: '',
  });
  return { status, calls, messages: messages.join('\n') };
}

test('PR deferral is limited to the exact bundled advisory graph', () => {
  const { lock, report } = fixture();
  assert.equal(isKnownNpmBundleReport(report, lock), true);
  const result = check('pull_request', [response(report), response(clean, 0)]);
  assert.equal(result.status, 0);
  assert.equal(result.calls, 2);
  assert.match(result.messages, /UNRESOLVED/);
  assert.ok(result.messages.includes(MANUAL_ACTION));
});

for (const event of [
  'push',
  'schedule',
  'workflow_dispatch',
  'pull_request_target',
  undefined,
]) {
  test(`${event ?? 'local'} enforcement fails with the required human action`, () => {
    const result = check(event, [
      response(fixture().report),
      response(clean, 0),
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.calls, 2);
    assert.match(result.messages, /::error::.*npm maintainers must publish/);
  });
}

test('new advisories, severities, bundle versions and nonbundled copies fail closed', () => {
  const mutations = [
    ({ report }) => {
      report.vulnerabilities.glob.via[0].url =
        'https://github.com/advisories/GHSA-new';
    },
    ({ report }) => {
      report.vulnerabilities.glob.severity = 'high';
    },
    ({ report }) => {
      report.vulnerabilities.glob.nodes.push('node_modules/glob');
    },
    ({ report }) => {
      report.metadata.vulnerabilities.total = 0;
    },
    ({ report }) => {
      report.error = { code: 'E401' };
    },
    ({ lock }) => {
      lock.packages['node_modules/npm'].version = '12.2.3';
    },
    ({ lock }) => {
      lock.packages['node_modules/npm'].resolved =
        'https://example.invalid/npm.tgz';
    },
    ({ lock }) => {
      lock.packages['node_modules/npm/node_modules/glob'].inBundle = false;
    },
    ({ lock }) => {
      lock.packages['node_modules/npm/node_modules/minimatch'].version =
        '10.2.6';
    },
  ];
  for (const mutate of mutations) {
    const data = fixture();
    mutate(data);
    assert.equal(isKnownNpmBundleReport(data.report, data.lock), false);
    assert.equal(
      check(
        'pull_request',
        [response(data.report), response(clean, 0)],
        data.lock
      ).status,
      1
    );
  }
});

test('application vulnerabilities fail even when the root bundle qualifies', () => {
  const result = check('pull_request', [
    response(fixture().report),
    response(fixture().report),
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.calls, 2);
});

test('registry, process and malformed-report failures never qualify', () => {
  for (const invalid of [
    { status: 1, stdout: 'not JSON' },
    { status: 0, stdout: '{}' },
    {
      status: null,
      error: new Error('ENOENT'),
      stdout: JSON.stringify(fixture().report),
    },
    response(fixture().report, 0),
    response(fixture().report, 2),
    response(clean, 1),
    response({ ...clean, vulnerabilities: [] }, 0),
    response({
      ...fixture().report,
      vulnerabilities: {
        glob: { severity: 'moderate', nodes: 'invalid', via: [] },
      },
    }),
  ]) {
    const result = check('pull_request', [invalid, response(clean, 0)]);
    assert.equal(result.status, 1);
    assert.equal(result.calls, 2);
  }
});

test('clean audits pass on main and on pull requests', () => {
  for (const event of ['push', 'pull_request'])
    assert.equal(
      check(event, [response(clean, 0), response(clean, 0)]).status,
      0
    );
});
