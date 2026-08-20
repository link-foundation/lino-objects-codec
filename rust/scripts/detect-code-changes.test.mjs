import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyChanges,
  isExcludedFromCodeChanges,
  isWorkflowFile,
  toPackagePaths,
} from "./detect-code-changes.mjs";

// Regression guard for the monorepo path bug found while solving issue #41
// (same class as issue #39): `git diff --name-only` yields repository-root
// paths, so every package-relative comparison has to strip the `rust/` prefix
// first.
test("toPackagePaths strips the package prefix and drops foreign packages", () => {
  const files = [
    "rust/src/lib.rs",
    "js/src/index.mjs",
    ".github/workflows/rust.yml",
  ];
  assert.deepEqual(toPackagePaths(files, "rust/"), ["src/lib.rs"]);
});

test("toPackagePaths is a no-op at the repository root", () => {
  const files = ["src/lib.rs"];
  assert.deepEqual(toPackagePaths(files, ""), files);
});

test("an examples-only pull request is not a code change", () => {
  const { outputs } = classifyChanges(["rust/examples/demo.rs"], "rust/");
  assert.equal(outputs["any-code-changed"], "false");
  assert.equal(outputs["rs-changed"], "true");
});

test("a changelog-fragment-only pull request is not a code change", () => {
  const { outputs } = classifyChanges(
    ["rust/changelog.d/20260820_fix.md"],
    "rust/",
  );
  assert.equal(outputs["any-code-changed"], "false");
  assert.equal(outputs["docs-changed"], "true");
});

test("Cargo.toml is detected through the package prefix", () => {
  const { outputs } = classifyChanges(["rust/Cargo.toml"], "rust/");
  assert.equal(outputs["toml-changed"], "true");
  assert.equal(outputs["any-code-changed"], "true");
});

test("a source change is a code change", () => {
  const { outputs } = classifyChanges(["rust/src/codec.rs"], "rust/");
  assert.equal(outputs["any-code-changed"], "true");
  assert.equal(outputs["rs-changed"], "true");
});

test("a workflow change counts as a code change", () => {
  const { outputs } = classifyChanges([".github/workflows/rust.yml"], "rust/");
  assert.equal(outputs["workflow-changed"], "true");
  assert.equal(outputs["any-code-changed"], "true");
});

test("another package's TOML no longer looks like a Rust change", () => {
  const { outputs } = classifyChanges(["python/pyproject.toml"], "rust/");
  assert.equal(outputs["toml-changed"], "false");
  assert.equal(outputs["any-code-changed"], "false");
});

test("isWorkflowFile only matches repository-root workflow paths", () => {
  assert.equal(isWorkflowFile(".github/workflows/rust.yml"), true);
  assert.equal(isWorkflowFile("rust/.github/workflows/rust.yml"), false);
});

test("markdown is excluded from code changes anywhere in the package", () => {
  assert.equal(isExcludedFromCodeChanges("docs/guide.md"), true);
  assert.equal(isExcludedFromCodeChanges("src/README.md"), true);
  assert.equal(isExcludedFromCodeChanges("src/lib.rs"), false);
});
