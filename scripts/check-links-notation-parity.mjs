#!/usr/bin/env node

/**
 * Enforce that the four implementations pin the same `links-notation` minor.
 *
 * Every codec here is a thin layer over the `links-notation` parser, and the
 * conformance suites assert that a document one language writes is read
 * identically by the other three. That claim only holds if all four are reading
 * with the same grammar. Before issue #47 they were not: Rust asked for
 * `0.12`, JavaScript for `^0.11.0`, Python for `>=0.11.0,<0.12.0` and C# for
 * `0.13.0`, four different parsers behind one test suite.
 *
 * Nothing caught that, because each manifest lives in its own language's
 * pipeline and no check ever compared them. This one does, on every pull
 * request, so the pins can only ever move together.
 *
 * The comparison is on `major.minor`. The patch component is deliberately left
 * out: the ranges are open at the patch level on purpose so a bug-fix release
 * is picked up without a commit, and the resolved patch legitimately differs
 * between ecosystems on any given day.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where each language declares its dependency on the parser, and how to read
 * the version out of that file.
 *
 * Each `extract` takes the raw manifest text and returns the declared version,
 * or `null` when the dependency is absent -- which is itself a failure, since
 * all four are supposed to depend on it.
 */
export const MANIFESTS = [
  {
    id: "rust",
    label: "Rust",
    path: "rust/Cargo.toml",
    // `links-notation = "0.16.1"` or `links-notation = { version = "0.16.1" }`
    extract: (text) =>
      match(text, /^\s*links-notation\s*=\s*"([^"]+)"/m) ??
      match(text, /^\s*links-notation\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/m),
  },
  {
    id: "js",
    label: "JavaScript",
    path: "js/package.json",
    extract: (text) => JSON.parse(text).dependencies?.["links-notation"] ?? null,
  },
  {
    id: "python",
    label: "Python",
    path: "python/pyproject.toml",
    // `"links-notation>=0.16.1,<0.17.0"` inside `dependencies = [...]`
    extract: (text) => match(text, /"links-notation([^"]*)"/),
  },
  {
    id: "csharp",
    label: "C#",
    path: "csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj",
    extract: (text) =>
      match(
        text,
        /<PackageReference\s+Include="Link\.Foundation\.Links\.Notation"\s+Version="([^"]+)"/,
      ),
  },
];

/**
 * First capture group of a regular expression, or `null` when it does not match.
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string|null}
 */
function match(text, pattern) {
  const found = text.match(pattern);
  return found ? found[1] : null;
}

/**
 * Reduce a declared requirement to the `major.minor` it pins.
 *
 * Handles the shapes the four ecosystems actually use: a bare `0.16.1`, npm's
 * `^0.16.1`, NuGet's `0.16.1`, and PEP 440's `>=0.16.1,<0.17.0`. For a range,
 * the lower bound is the pin -- it is the version the code is written against.
 *
 * @param {string|null} requirement
 * @returns {string|null} e.g. `"0.16"`, or `null` when no version is readable
 */
export function pinnedMinor(requirement) {
  if (!requirement) return null;
  // The lower bound is the first version-looking token in the requirement.
  const version = requirement.match(/(\d+)\.(\d+)/);
  return version ? `${version[1]}.${version[2]}` : null;
}

/**
 * Compare the declared requirements of the four implementations.
 *
 * @param {Array<{id: string, label: string, requirement: string|null}>} declarations
 * @returns {{agreed: boolean, minors: Record<string, string|null>, missing: string[]}}
 */
export function analyzeVersionParity(declarations) {
  const minors = {};
  const missing = [];
  for (const { id, requirement } of declarations) {
    const minor = pinnedMinor(requirement);
    minors[id] = minor;
    if (!minor) missing.push(id);
  }
  const distinct = new Set(Object.values(minors));
  const agreed = missing.length === 0 && distinct.size === 1;
  return { agreed, minors, missing };
}

/**
 * Read the four manifests from disk and return what each declares.
 *
 * @param {string} [root] - repository root; defaults to this script's parent
 * @returns {Array<{id: string, label: string, path: string, requirement: string|null}>}
 */
export function readDeclarations(root = REPO_ROOT) {
  return MANIFESTS.map((manifest) => {
    let requirement = null;
    try {
      requirement = manifest.extract(readFileSync(join(root, manifest.path), "utf-8"));
    } catch (error) {
      console.error(`Could not read ${manifest.path}: ${error.message}`);
    }
    return { ...manifest, requirement };
  });
}

function main() {
  const declarations = readDeclarations();
  const { agreed, minors, missing } = analyzeVersionParity(declarations);

  console.log("Declared `links-notation` requirement per implementation:");
  for (const { id, label, path, requirement } of declarations) {
    console.log(`  ${label.padEnd(10)} ${requirement ?? "(not found)"}   (${path})`);
  }
  console.log("");

  if (agreed) {
    const [minor] = new Set(Object.values(minors));
    console.log(`links-notation parity: all four implementations pin ${minor}.x.`);
    return;
  }

  console.error("::error::links-notation parity check failed.");
  if (missing.length > 0) {
    const labels = MANIFESTS.filter((m) => missing.includes(m.id)).map((m) => m.label);
    console.error(`  No readable version for: ${labels.join(", ")}`);
  }
  const disagreeing = [...new Set(Object.values(minors).filter(Boolean))];
  if (disagreeing.length > 1) {
    console.error(`  Pinned minors disagree: ${disagreeing.sort().join(", ")}`);
  }
  console.error("");
  console.error(
    "The conformance suites assert that a document written by one implementation reads",
  );
  console.error(
    "back identically in the other three, which only holds while all four parse with",
  );
  console.error(
    "the same grammar. Move every pin to the same minor in one change. See issue #47.",
  );
  process.exit(1);
}

// Run only when invoked directly, not when imported by the test.
const invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invokedPath.endsWith("check-links-notation-parity.mjs")) {
  main();
}
