export function parseCratesVersionResponse({ status, body }) {
  if (status === 404) {
    return false;
  }

  if (status !== 200) {
    throw new Error(
      `crates.io version probe returned HTTP ${status}; refusing to guess release state`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `crates.io version probe returned invalid JSON: ${error.message}`
    );
  }

  if (!parsed || !parsed.version || typeof parsed.version !== 'object') {
    throw new Error('crates.io version probe did not include a version object');
  }

  return true;
}

export function decideRustRelease({ hasFragments, currentVersionPublished }) {
  if (hasFragments) {
    return {
      shouldRelease: true,
      skipBump: false,
      reason: 'changelog fragments found',
    };
  }

  if (currentVersionPublished) {
    return {
      shouldRelease: false,
      skipBump: false,
      reason: 'current Cargo.toml version already exists on crates.io',
    };
  }

  return {
    shouldRelease: true,
    skipBump: true,
    reason: 'current Cargo.toml version is missing from crates.io',
  };
}

export function isAlreadyExistingReleaseError(output) {
  const lowerOutput = output.toLowerCase();
  return (
    lowerOutput.includes('already_exists') ||
    lowerOutput.includes('already exists') ||
    lowerOutput.includes('validation failed')
  );
}

/**
 * Issue #84: crates.io kept serving 0.9.3, which requires
 * `links-notation ^0.27.1`, while the repository had already moved to 0.31.x.
 * The registry entry is immutable, so the only proof that a release carries
 * the migrated dependencies is to read the published dependency metadata back
 * and compare it with the manifest that was published.
 */
const DEPENDENCY_SECTIONS = {
  dependencies: 'normal',
  'dev-dependencies': 'dev',
  'build-dependencies': 'build',
};

function readInlineField(table, field) {
  const match = table.match(
    new RegExp(`(?:^|[,{\\s])${field}\\s*=\\s*("([^"]*)"|true|false)`)
  );
  if (!match) {
    return undefined;
  }
  return match[2] !== undefined ? match[2] : match[1] === 'true';
}

/**
 * Read the registry dependencies declared in a Cargo.toml.
 *
 * Supports the two forms this repository uses, `name = "1.2"` and
 * `name = { version = "1.2", optional = true, ... }`; path- and git-only
 * dependencies are skipped because crates.io never lists them.
 *
 * @param {string} cargoToml - the manifest text
 * @returns {{name: string, kind: string, req: string, optional: boolean}[]}
 */
export function parseManifestDependencies(cargoToml) {
  const dependencies = [];
  let kind = null;
  for (const rawLine of cargoToml.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('[')) {
      // Any table header ends the previous section, including `[[example]]`.
      const section = line.match(/^\[([^[\]]+)\]$/);
      kind = section ? (DEPENDENCY_SECTIONS[section[1].trim()] ?? null) : null;
      continue;
    }
    if (!kind) {
      continue;
    }
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!entry) {
      continue;
    }
    const [, name, value] = entry;
    if (value.startsWith('"')) {
      dependencies.push({
        name,
        kind,
        req: value.replace(/^"|"$/g, ''),
        optional: false,
      });
      continue;
    }
    const version = readInlineField(value, 'version');
    if (typeof version !== 'string') {
      continue;
    }
    dependencies.push({
      name: readInlineField(value, 'package') ?? name,
      kind,
      req: version,
      optional: readInlineField(value, 'optional') === true,
    });
  }
  return dependencies;
}

/**
 * Normalize a version requirement the way cargo does when it uploads one:
 * a bare `1.2.3` is a caret requirement, so the registry stores `^1.2.3`.
 *
 * @param {string} req
 * @returns {string}
 */
export function normalizeRequirement(req) {
  const trimmed = req.trim();
  return /^\d/.test(trimmed) ? `^${trimmed}` : trimmed;
}

/**
 * Parse the body of `GET /api/v1/crates/<name>/<version>/dependencies`.
 *
 * @param {{status: number, body: string}} response
 * @returns {{name: string, kind: string, req: string, optional: boolean}[]}
 */
export function parseCratesDependenciesResponse({ status, body }) {
  if (status !== 200) {
    throw new Error(`crates.io dependencies endpoint returned HTTP ${status}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `crates.io dependencies endpoint returned invalid JSON: ${error.message}`
    );
  }
  if (!parsed || !Array.isArray(parsed.dependencies)) {
    throw new Error(
      'crates.io dependencies endpoint did not include a dependencies array'
    );
  }
  return parsed.dependencies.map((dependency) => ({
    name: dependency.crate_id,
    kind: dependency.kind,
    req: dependency.req,
    optional: dependency.optional === true,
  }));
}

/**
 * Compare the manifest that was published with what crates.io now serves.
 *
 * @returns {string[]} one human-readable line per mismatch; empty means equal
 */
export function compareDependencies(manifest, registry) {
  const key = ({ name, kind }) => `${name} (${kind})`;
  const published = new Map(registry.map((dep) => [key(dep), dep]));
  const expected = new Map(manifest.map((dep) => [key(dep), dep]));
  const problems = [];
  for (const [id, dep] of expected) {
    const actual = published.get(id);
    const wanted = normalizeRequirement(dep.req);
    if (!actual) {
      problems.push(`${id}: missing from crates.io, expected ${wanted}`);
      continue;
    }
    if (normalizeRequirement(actual.req) !== wanted) {
      problems.push(`${id}: crates.io has ${actual.req}, expected ${wanted}`);
    }
    if (actual.optional !== dep.optional) {
      problems.push(
        `${id}: crates.io has optional=${actual.optional}, expected optional=${dep.optional}`
      );
    }
  }
  for (const id of published.keys()) {
    if (!expected.has(id)) {
      problems.push(`${id}: listed on crates.io but not in Cargo.toml`);
    }
  }
  return problems;
}

function parseVersion(text) {
  const match = text.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    throw new Error(`not a version: ${text}`);
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Whether a resolved version satisfies a caret requirement such as `^0.31.4`
 * (or the bare `0.31.4` cargo reads the same way). Only caret requirements
 * occur in this crate's manifest; anything else is reported as unsupported.
 *
 * @param {string} version - e.g. `0.31.4`
 * @param {string} req - e.g. `^0.31.4`
 * @returns {boolean}
 */
export function satisfiesCaret(version, req) {
  const normalized = normalizeRequirement(req);
  if (!normalized.startsWith('^')) {
    throw new Error(`unsupported version requirement: ${req}`);
  }
  const floor = parseVersion(normalized.slice(1));
  const actual = parseVersion(version);
  // The leftmost non-zero component of the floor must match exactly.
  const fixed = floor[0] !== 0 ? 1 : floor[1] !== 0 ? 2 : 3;
  for (let i = 0; i < fixed; i += 1) {
    if (actual[i] !== floor[i]) {
      return false;
    }
  }
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] !== floor[i]) {
      return actual[i] > floor[i];
    }
  }
  return true;
}

/**
 * Parse `cargo tree --prefix none` lines such as `links-notation v0.31.4`.
 *
 * @param {string} output
 * @returns {Map<string, string>} crate name -> resolved version
 */
export function parseCargoTree(output) {
  const resolved = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z0-9_-]+) v(\S+)/);
    if (match && !resolved.has(match[1])) {
      resolved.set(match[1], match[2]);
    }
  }
  return resolved;
}
