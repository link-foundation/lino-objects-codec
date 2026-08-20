#!/usr/bin/env node

/** Tests for the cross-language parity gate. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeParity, LANGUAGES } from "./check-language-parity.mjs";

test("a change to every language is balanced", () => {
  const result = analyzeParity([
    "js/src/codec.js",
    "python/src/link_notation_objects_codec/codec.py",
    "rust/src/lib.rs",
    "csharp/src/Lino.Objects.Codec/ObjectCodec.cs",
  ]);
  assert.deepEqual(result.changed.sort(), ["csharp", "js", "python", "rust"]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.balanced, true);
});

test("a change to only one language is not balanced", () => {
  const result = analyzeParity(["rust/src/lib.rs"]);
  assert.deepEqual(result.changed, ["rust"]);
  assert.deepEqual(result.missing.sort(), ["csharp", "js", "python"]);
  assert.equal(result.balanced, false);
});

test("a change to three of four languages is not balanced", () => {
  const result = analyzeParity([
    "js/src/codec.js",
    "python/src/link_notation_objects_codec/codec.py",
    "rust/src/lib.rs",
  ]);
  assert.deepEqual(result.missing, ["csharp"]);
  assert.equal(result.balanced, false);
});

test("shared-only changes are balanced (nothing to enforce)", () => {
  const result = analyzeParity([
    "README.md",
    "fixtures/readable-format/cases.json",
    ".github/workflows/parity.yml",
    "docs/case-studies/issue-39/README.md",
  ]);
  assert.deepEqual(result.changed, []);
  assert.equal(result.balanced, true);
});

test("tests and examples do not count as library source", () => {
  const result = analyzeParity([
    "rust/tests/readable_format.rs",
    "js/examples/basic_usage.js",
    "python/tests/test_format.py",
  ]);
  assert.deepEqual(result.changed, []);
  assert.equal(result.balanced, true);
});

test("backslash and ./ prefixed paths are normalized", () => {
  const result = analyzeParity([
    "./js/src/codec.js",
    "python\\src\\link_notation_objects_codec\\codec.py",
  ]);
  assert.deepEqual(result.changed.sort(), ["js", "python"]);
});

test("every declared language has a source path", () => {
  for (const language of LANGUAGES) {
    assert.ok(
      language.sources.length > 0,
      `${language.id} needs at least one source path`,
    );
  }
});
