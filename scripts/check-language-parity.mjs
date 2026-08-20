#!/usr/bin/env node

/**
 * Enforce that the four language implementations move together.
 *
 * Issue #39 requires that "any changes in code for a single language without a
 * change in all of them will fail the CI/CD on pull requests, so all languages
 * are always updated at the same time." PR #38 changed only the Rust codec and
 * no other language's CI even ran, because every workflow filters itself by
 * `paths:`. This check runs on every pull request with no such filter.
 *
 * The rule: if the library source of any language changed, the library source
 * of every language must change too. A pull request that touches only shared
 * files (docs, fixtures, root config) is unaffected.
 *
 * An intentional single-language change can opt out by putting the marker
 * `[skip-parity]` in the pull request title or body, which the workflow passes
 * in through the `PARITY_SKIP_REASON` environment variable.
 */

import { execSync } from "child_process";

/** The languages that must stay in lock-step, and the paths that count as their library source. */
export const LANGUAGES = [
  { id: "js", label: "JavaScript", sources: ["js/src/"] },
  { id: "python", label: "Python", sources: ["python/src/"] },
  { id: "rust", label: "Rust", sources: ["rust/src/"] },
  { id: "csharp", label: "C#", sources: ["csharp/src/"] },
];

/**
 * Decide which languages a set of changed files touches, and whether the change
 * is balanced across all of them.
 *
 * @param {string[]} changedFiles - repository-relative paths that changed
 * @returns {{changed: string[], missing: string[], balanced: boolean}}
 */
export function analyzeParity(changedFiles) {
  const normalized = changedFiles.map((file) =>
    file.replace(/\\/g, "/").replace(/^\.\//, ""),
  );
  const changed = LANGUAGES.filter((language) =>
    language.sources.some((source) =>
      normalized.some((file) => file.startsWith(source)),
    ),
  ).map((language) => language.id);
  const missing = LANGUAGES.filter(
    (language) => !changed.includes(language.id),
  ).map((language) => language.id);
  // Balanced when no language's source changed, or when every one did.
  const balanced = changed.length === 0 || changed.length === LANGUAGES.length;
  return { changed, missing, balanced };
}

/**
 * List the files that differ between the merge base and the current HEAD.
 *
 * @param {string} baseRef - the branch the pull request targets, e.g. `main`
 * @returns {string[]}
 */
export function changedFilesAgainst(baseRef) {
  const range = baseRef ? `origin/${baseRef}...HEAD` : "HEAD~1...HEAD";
  const output = execSync(`git diff --name-only ${range}`, {
    encoding: "utf-8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const skipReason = (process.env.PARITY_SKIP_REASON || "").trim();
  if (skipReason) {
    console.log(`Language parity check skipped: ${skipReason}`);
    return;
  }

  const baseRef =
    process.env.PARITY_BASE_REF || process.env.GITHUB_BASE_REF || "";
  let files;
  try {
    files = changedFilesAgainst(baseRef);
  } catch (error) {
    console.error(`Could not compute changed files: ${error.message}`);
    process.exit(2);
  }

  const { changed, missing, balanced } = analyzeParity(files);
  if (balanced) {
    if (changed.length === 0) {
      console.log(
        "Language parity: no language source changed; nothing to enforce.",
      );
    } else {
      console.log("Language parity: every language was updated together.");
    }
    return;
  }

  const changedLabels = LANGUAGES.filter((l) => changed.includes(l.id)).map(
    (l) => l.label,
  );
  const missingLabels = LANGUAGES.filter((l) => missing.includes(l.id)).map(
    (l) => l.label,
  );
  console.error("Language parity check failed.");
  console.error(`  Changed: ${changedLabels.join(", ")}`);
  console.error(`  Missing a matching change: ${missingLabels.join(", ")}`);
  console.error("");
  console.error(
    "This repository keeps its four implementations byte-for-byte compatible, so a",
  );
  console.error(
    "change to one language must be mirrored in the others in the same pull request.",
  );
  console.error(
    "If this change is intentionally single-language, add `[skip-parity]` to the",
  );
  console.error("pull request title or body.");
  process.exit(1);
}

// Run only when invoked directly, not when imported by the test.
const invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invokedPath.endsWith("check-language-parity.mjs")) {
  main();
}
