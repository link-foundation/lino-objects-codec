#!/usr/bin/env node

/** Tests for the `links-notation` version parity gate (issue #47). */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MANIFESTS,
  analyzeVersionParity,
  pinnedMinor,
  readDeclarations,
} from "./check-links-notation-parity.mjs";

test("the requirement syntax of every ecosystem reduces to a minor", () => {
  assert.equal(pinnedMinor("0.16.1"), "0.16", "Cargo and NuGet write a bare version");
  assert.equal(pinnedMinor("^0.16.1"), "0.16", "npm writes a caret range");
  assert.equal(pinnedMinor(">=0.16.1,<0.17.0"), "0.16", "PEP 440 writes a range");
  assert.equal(pinnedMinor("~0.16"), "0.16", "a two-component version still reads");
  assert.equal(pinnedMinor("1.0.0"), "1.0", "the parser will not stay pre-1.0 forever");
});

test("a missing dependency is not a version", () => {
  assert.equal(pinnedMinor(null), null);
  assert.equal(pinnedMinor(""), null);
  assert.equal(pinnedMinor("*"), null, "an unbounded range pins nothing");
});

test("four pins on the same minor agree", () => {
  const result = analyzeVersionParity([
    { id: "rust", requirement: "0.16.1" },
    { id: "js", requirement: "^0.16.1" },
    { id: "python", requirement: ">=0.16.1,<0.17.0" },
    { id: "csharp", requirement: "0.16.1" },
  ]);
  assert.equal(result.agreed, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.minors, {
    rust: "0.16",
    js: "0.16",
    python: "0.16",
    csharp: "0.16",
  });
});

test("a differing patch is still agreement", () => {
  // The ranges are open at the patch level on purpose, so a bug-fix release is
  // picked up without a commit. Failing on that would make the gate noise.
  const result = analyzeVersionParity([
    { id: "rust", requirement: "0.16.1" },
    { id: "js", requirement: "^0.16.4" },
    { id: "python", requirement: ">=0.16.0,<0.17.0" },
    { id: "csharp", requirement: "0.16.2" },
  ]);
  assert.equal(result.agreed, true);
});

test("the four pins this repository actually shipped before issue #47 diverge", () => {
  // Rust asked for 0.12, JavaScript for ^0.11.0, Python for >=0.11.0,<0.12.0
  // and C# for 0.13.0 -- three different grammars behind one conformance
  // suite, and no check compared them.
  const result = analyzeVersionParity([
    { id: "rust", requirement: "0.12" },
    { id: "js", requirement: "^0.11.0" },
    { id: "python", requirement: ">=0.11.0,<0.12.0" },
    { id: "csharp", requirement: "0.13.0" },
  ]);
  assert.equal(result.agreed, false);
  assert.deepEqual(result.minors, {
    rust: "0.12",
    js: "0.11",
    python: "0.11",
    csharp: "0.13",
  });
});

test("one language falling behind by a minor fails", () => {
  const result = analyzeVersionParity([
    { id: "rust", requirement: "0.17.0" },
    { id: "js", requirement: "^0.17.0" },
    { id: "python", requirement: ">=0.17.0,<0.18.0" },
    { id: "csharp", requirement: "0.16.1" },
  ]);
  assert.equal(result.agreed, false);
});

test("a dependency that cannot be read fails rather than passing quietly", () => {
  const result = analyzeVersionParity([
    { id: "rust", requirement: "0.16.1" },
    { id: "js", requirement: "^0.16.1" },
    { id: "python", requirement: null },
    { id: "csharp", requirement: "0.16.1" },
  ]);
  assert.equal(result.agreed, false);
  assert.deepEqual(result.missing, ["python"]);
});

test("every extractor finds the version in its real manifest", () => {
  // Guards the regexes against a manifest reformat that would silently turn the
  // gate into a no-op -- the failure mode the parity check itself is meant to
  // prevent.
  const declarations = readDeclarations();
  assert.equal(declarations.length, MANIFESTS.length);
  for (const { label, path, requirement } of declarations) {
    assert.ok(requirement, `no links-notation requirement found for ${label} in ${path}`);
    assert.ok(pinnedMinor(requirement), `unreadable version for ${label}: ${requirement}`);
  }
});

test("the checked-in manifests agree today", () => {
  assert.equal(analyzeVersionParity(readDeclarations()).agreed, true);
});
