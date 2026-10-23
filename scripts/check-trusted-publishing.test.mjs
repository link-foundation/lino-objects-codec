#!/usr/bin/env node

/**
 * Workflow policy test for crates.io trusted publishing (issues #73 and #75).
 *
 * Organization policy: every publish tries OIDC trusted publishing first and
 * falls back to the long-lived token secret only when the exchange fails. A
 * later edit could silently drop either half (removing the fallback breaks
 * releases until a trusted publisher is registered; removing the auth step
 * quietly returns to tokens), so the order is pinned here.
 *
 * The workflows are read as text, one job and one step at a time, which keeps
 * this test free of a YAML dependency; the layout it relies on (two-space job
 * keys under `jobs:`, `      - ` step items) is the one every workflow here
 * uses and actionlint enforces as valid YAML.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");
const AUTH_ACTION = "rust-lang/crates-io-auth-action";

function workflowFiles() {
  return readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(join(WORKFLOWS, name), "utf8") }));
}

/** Split a workflow into its jobs: [{ name, text }]. */
function jobs(text) {
  const body = text.slice(text.search(/^jobs:$/m));
  return body
    .split(/^(?=  [\w-]+:$)/m)
    .filter((chunk) => /^  [\w-]+:$/m.test(chunk.split("\n")[0]))
    .map((chunk) => ({ name: chunk.split("\n")[0].trim().slice(0, -1), text: chunk }));
}

/** Split a job into its steps, in order. */
function steps(jobText) {
  const start = jobText.search(/^    steps:$/m);
  if (start < 0) return [];
  return jobText
    .slice(start)
    .split(/^(?=      - )/m)
    .slice(1);
}

const field = (step, key) => step.match(new RegExp(`^ {6}[- ] ${key}: (.*)$`, "m"))?.[1].trim();
const envVar = (step, key) => step.match(new RegExp(`^ {8}env:\n(?: {10}.*\n)*? {10}${key}: (.*)$`, "m"))?.[1].trim();

function publishJobs() {
  return workflowFiles().flatMap(({ name, text }) =>
    jobs(text)
      .filter((job) => /^\s+(?:if ! OUT=\$\()?cargo publish\b/m.test(job.text))
      .map((job) => ({ file: name, ...job })),
  );
}

test("the release jobs that run cargo publish are found", () => {
  const found = publishJobs().map((job) => `${job.file}:${job.name}`);
  assert.deepEqual(found.sort(), ["rust.yml:auto-release", "rust.yml:manual-release"]);
});

for (const job of publishJobs()) {
  const where = `${job.file}:${job.name}`;
  const list = steps(job.text);
  const authIndex = list.findIndex((step) => field(step, "uses")?.startsWith(`${AUTH_ACTION}@`));
  const publishIndex = list.findIndex((step) => /cargo publish\b/.test(step.replace(/^\s*#.*$/gm, "")));

  test(`${where} may request an OIDC token`, () => {
    assert.match(job.text, /^    permissions:\n(?: {6}.*\n)*? {6}id-token: write$/m);
  });

  test(`${where} authenticates with trusted publishing before publishing`, () => {
    assert.ok(authIndex >= 0, `no ${AUTH_ACTION} step`);
    assert.ok(authIndex < publishIndex, "the auth step must run before cargo publish");
    const auth = list[authIndex];
    assert.match(field(auth, "uses"), new RegExp(`^${AUTH_ACTION}@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+$`));
    assert.equal(field(auth, "id"), "crates_auth");
    assert.equal(field(auth, "continue-on-error"), "true", "a missing trusted publisher must fall back, not fail");
    assert.equal(field(auth, "if"), field(list[publishIndex], "if"), "auth and publish must run together");
  });

  test(`${where} falls back to the token secrets`, () => {
    assert.equal(
      envVar(list[publishIndex], "CARGO_REGISTRY_TOKEN"),
      "${{ steps.crates_auth.outputs.token || secrets.CARGO_REGISTRY_TOKEN || secrets.CARGO_TOKEN }}",
    );
  });
}

test("continue-on-error is reserved for the trusted publishing exchange", () => {
  for (const { name, text } of workflowFiles()) {
    for (const job of jobs(text)) {
      for (const step of steps(job.text)) {
        if (field(step, "continue-on-error") === undefined) continue;
        assert.ok(
          field(step, "uses")?.startsWith(`${AUTH_ACTION}@`) && field(step, "id"),
          `${name}:${job.name}: continue-on-error outside a ${AUTH_ACTION} step with an id`,
        );
      }
    }
  }
});

test("every OIDC token consumer keeps a secret fallback", () => {
  for (const { name, text } of workflowFiles()) {
    for (const line of text.split("\n")) {
      if (!/steps\.[\w-]+\.outputs\.token\b/.test(line)) continue;
      assert.match(line, /steps\.[\w-]+\.outputs\.token \|\| secrets\.\w+/, `${name}: ${line.trim()}`);
    }
  }
});
