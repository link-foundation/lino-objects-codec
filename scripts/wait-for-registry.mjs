#!/usr/bin/env node

/**
 * Wait for a freshly published package version to become visible in its registry.
 *
 * Issue #41: the C# release job reported
 * `Lino.Objects.Codec@0.2.0 is not on NuGet after publish` even though
 * `dotnet nuget push` had already answered `201 Created`. The verification step
 * polled NuGet's flat-container API six times at ten-second intervals — a
 * sixty-second budget — while the package only became visible about six and a
 * half minutes after the push. The job was red, the publish was fine: a false
 * negative caused purely by an impatient readback.
 *
 * Every registry here indexes asynchronously, so `publish returned success` and
 * `the package can be downloaded` are different events, sometimes minutes apart:
 *
 *   - NuGet documents package validation and indexing as taking up to fifteen
 *     minutes (https://learn.microsoft.com/nuget/nuget-org/publish-a-package),
 *     and its flat container answers `BlobNotFound` until indexing completes.
 *   - PyPI, npm and crates.io are usually quick but still CDN-fronted, so a
 *     readback within a few seconds of the upload can miss.
 *
 * This script therefore replaces the hand-rolled `for i in 1 2 3; do curl; done`
 * loops in the workflows with one bounded, per-registry-tuned poll that treats
 * "not visible yet" as "keep waiting" and only fails once the registry's own
 * documented indexing window has elapsed.
 *
 * Usage:
 *   node scripts/wait-for-registry.mjs --registry nuget --name Lino.Objects.Codec --version 0.2.0
 *
 * Options:
 *   --registry <nuget|pypi|crates|npm>  Which registry to poll (required).
 *   --name <package>                    Package name as the registry spells it (required).
 *   --version <version>                 Version that was just published (required).
 *   --max-attempts <count>              Overrides the registry default.
 *   --delay-seconds <count>             Overrides the registry default.
 *   --verbose                           Print every probe's URL, status and elapsed time.
 *
 * Environment overrides, used by the tests and available for debugging a live
 * run without editing the workflow:
 *   REGISTRY_WAIT_BASE_URL, REGISTRY_WAIT_MAX_ATTEMPTS,
 *   REGISTRY_WAIT_DELAY_SECONDS, REGISTRY_WAIT_VERBOSE
 *
 * Verbose output is off by default so a healthy run stays quiet; switch it on
 * with `--verbose` or `REGISTRY_WAIT_VERBOSE=1` when a failure needs diagnosing.
 *
 * Writes `available=true|false` and `attempts=<n>` to `$GITHUB_OUTPUT`.
 * Exit code 0 means the version is visible, 1 means it is not (or misuse).
 */

import { appendFileSync } from "node:fs";

/**
 * Identify the caller on every probe.
 *
 * crates.io enforces a data access policy (https://crates.io/data-access) that
 * answers `403` with an "unable to process your request" body to any client
 * that does not send a descriptive `User-Agent`. Node's default `fetch` agent
 * is rejected by it, so an anonymous readback would report a published crate as
 * missing — the same false negative this script exists to prevent, just moved
 * to a different registry. The other three registries ignore the header.
 */
export const USER_AGENT =
  "lino-objects-codec-ci (+https://github.com/link-foundation/lino-objects-codec)";

/**
 * Per-registry probe URLs and polling budgets.
 *
 * The budgets are deliberately asymmetric: they mirror what each registry
 * documents about its own indexing latency rather than a single shared guess.
 * NuGet gets fifteen minutes because that is the published upper bound; the
 * others get five, which is already an order of magnitude more than their
 * observed latency.
 */
export const REGISTRIES = {
  nuget: {
    label: "NuGet",
    baseUrl: "https://api.nuget.org/v3-flatcontainer",
    // 11 attempts with 90s between them = 15 minutes of waiting, matching
    // NuGet's documented indexing window.
    maxAttempts: 11,
    delaySeconds: 90,
    probeUrl: (baseUrl, name, version) => {
      const id = name.toLowerCase();
      return `${baseUrl}/${id}/${version.toLowerCase()}/${id}.nuspec`;
    },
  },
  pypi: {
    label: "PyPI",
    baseUrl: "https://pypi.org",
    // 11 attempts with 30s between them = 5 minutes of waiting.
    maxAttempts: 11,
    delaySeconds: 30,
    probeUrl: (baseUrl, name, version) =>
      `${baseUrl}/pypi/${name}/${version}/json`,
  },
  crates: {
    label: "crates.io",
    baseUrl: "https://crates.io/api/v1",
    maxAttempts: 11,
    delaySeconds: 30,
    probeUrl: (baseUrl, name, version) =>
      `${baseUrl}/crates/${name}/${version}`,
  },
  npm: {
    label: "npm",
    baseUrl: "https://registry.npmjs.org",
    maxAttempts: 11,
    delaySeconds: 30,
    probeUrl: (baseUrl, name, version) => `${baseUrl}/${name}/${version}`,
  },
};

/**
 * Parse `--flag value` and `--flag=value` pairs plus the boolean `--verbose`.
 *
 * @param {string[]} argv
 * @returns {Record<string, string|boolean>}
 */
export function readCliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const equals = arg.indexOf("=");
    if (equals !== -1) {
      options[arg.slice(2, equals)] = arg.slice(equals + 1);
      continue;
    }

    const name = arg.slice(2);
    const next = argv[index + 1];
    if (name === "verbose" && (next === undefined || next.startsWith("--"))) {
      options.verbose = true;
      continue;
    }
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = next;
    index++;
  }
  return options;
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function parseBoolean(value) {
  if (value === true) return true;
  if (value === undefined || value === null || value === "") return false;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

/**
 * Turn command line arguments and the environment into a validated config.
 *
 * Precedence is command line, then environment, then the registry's default,
 * so a workflow can pin a budget and an operator can still override it for one
 * re-run without touching the YAML.
 *
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 */
export function parseArgs(argv, env = process.env) {
  const options = readCliOptions(argv);
  const registryId = String(options.registry || env.REGISTRY_WAIT_REGISTRY || "");
  const registry = REGISTRIES[registryId];
  if (!registry) {
    throw new Error(
      `--registry must be one of ${Object.keys(REGISTRIES).join(", ")}, got "${registryId}"`,
    );
  }

  return {
    registryId,
    registry,
    baseUrl:
      options["base-url"] || env.REGISTRY_WAIT_BASE_URL || registry.baseUrl,
    name: String(options.name || env.REGISTRY_WAIT_NAME || ""),
    version: String(options.version || env.REGISTRY_WAIT_VERSION || ""),
    maxAttempts: parsePositiveInteger(
      options["max-attempts"] ||
        env.REGISTRY_WAIT_MAX_ATTEMPTS ||
        String(registry.maxAttempts),
      "--max-attempts",
    ),
    delaySeconds: parsePositiveInteger(
      options["delay-seconds"] ||
        env.REGISTRY_WAIT_DELAY_SECONDS ||
        String(registry.delaySeconds),
      "--delay-seconds",
    ),
    verbose: parseBoolean(options.verbose) || parseBoolean(env.REGISTRY_WAIT_VERBOSE),
  };
}

/**
 * Build the URL that answers "does this exact version exist?".
 *
 * @param {{registryId: string, baseUrl?: string, name: string, version: string}} params
 * @returns {string}
 */
export function buildProbeUrl({ registryId, baseUrl, name, version }) {
  const registry = REGISTRIES[registryId];
  if (!registry) throw new Error(`Unknown registry "${registryId}"`);
  const root = (baseUrl || registry.baseUrl).replace(/\/+$/, "");
  return registry.probeUrl(root, name, version);
}

/**
 * Probe the registry once.
 *
 * A network error is reported as a non-fatal miss rather than thrown: a DNS
 * blip in the middle of a fifteen-minute wait should cost one attempt, not the
 * whole release.
 *
 * @returns {Promise<{available: boolean, status: number|string, url: string, error?: string}>}
 */
export async function probeOnce({
  registryId,
  baseUrl,
  name,
  version,
  fetchImpl = fetch,
}) {
  const url = buildProbeUrl({ registryId, baseUrl, name, version });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    });
    return { available: response.status === 200, status: response.status, url };
  } catch (error) {
    return {
      available: false,
      status: "network-error",
      url,
      error: error.message,
    };
  }
}

function sleep(seconds) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, seconds * 1000);
  });
}

/**
 * Poll until the version shows up or the budget runs out.
 *
 * @returns {Promise<{available: boolean, attempts: number}>}
 */
export async function waitForPackage({
  registryId,
  baseUrl,
  name,
  version,
  maxAttempts = REGISTRIES[registryId]?.maxAttempts ?? 10,
  delaySeconds = REGISTRIES[registryId]?.delaySeconds ?? 30,
  verbose = false,
  probe = probeOnce,
  sleepFn = sleep,
  log = console.log,
}) {
  const label = REGISTRIES[registryId]?.label ?? registryId;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await probe({ registryId, baseUrl, name, version });
    log(
      `${label}: ${name}@${version} -> ${result.status} (attempt ${attempt}/${maxAttempts})`,
    );
    if (verbose) {
      log(`  probe url: ${result.url}`);
      if (result.error) log(`  probe error: ${result.error}`);
      log(`  elapsed: ~${(attempt - 1) * delaySeconds}s of ${(maxAttempts - 1) * delaySeconds}s budget`);
    }
    if (result.available) return { available: true, attempts: attempt };

    if (attempt < maxAttempts) {
      log(`${label}: not indexed yet, waiting ${delaySeconds}s`);
      await sleepFn(delaySeconds);
    }
  }
  return { available: false, attempts: maxAttempts };
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) appendFileSync(outputFile, `${name}=${value}\n`);
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
  logError = console.error,
} = {}) {
  let config;
  try {
    config = parseArgs(argv, env);
  } catch (error) {
    logError(`Error: ${error.message}`);
    return 1;
  }

  if (!config.name || !config.version) {
    logError("Error: --name and --version are required");
    return 1;
  }

  const budget = (config.maxAttempts - 1) * config.delaySeconds;
  log(
    `Waiting for ${config.name}@${config.version} on ${config.registry.label} ` +
      `(up to ${config.maxAttempts} attempts over ~${Math.round(budget / 60)} minutes)`,
  );

  const { available, attempts } = await waitForPackage({ ...config, log });
  setOutput("available", available ? "true" : "false");
  setOutput("attempts", String(attempts));

  if (!available) {
    // Say plainly which of the two possibilities this is, because they need
    // different responses: a publish that never happened must be re-run, while
    // a publish that is merely slow to index must be left alone.
    logError(
      `::error title=${config.registry.label} verification failed::` +
        `${config.name}@${config.version} was not visible on ${config.registry.label} ` +
        `after ~${Math.round(budget / 60)} minutes. If the publish step reported success, ` +
        `the version is probably still indexing — check ${buildProbeUrl(config)} before re-publishing. ` +
        `Re-run with REGISTRY_WAIT_VERBOSE=1 for per-attempt detail.`,
    );
    return 1;
  }

  log(`${config.name}@${config.version} is available on ${config.registry.label}.`);
  return 0;
}

const invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invokedPath.endsWith("wait-for-registry.mjs")) {
  process.exitCode = await main();
}
