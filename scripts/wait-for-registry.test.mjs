#!/usr/bin/env node

/** Tests for the post-publish registry readback (issue #41). */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGISTRIES,
  buildProbeUrl,
  main,
  parseArgs,
  probeOnce,
  readCliOptions,
  USER_AGENT,
  waitForPackage,
} from "./wait-for-registry.mjs";

/** Collect log lines instead of printing them. */
function recorder() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
}

/** A probe that answers with the given statuses in order, repeating the last. */
function scriptedProbe(statuses) {
  const calls = [];
  const probe = async ({ registryId, baseUrl, name, version }) => {
    const status = statuses[Math.min(calls.length, statuses.length - 1)];
    const url = buildProbeUrl({ registryId, baseUrl, name, version });
    calls.push(url);
    return { available: status === 200, status, url };
  };
  return { calls, probe };
}

test("issue #41 regression: a package that indexes after the old 60s budget still passes", async () => {
  // The C# run polled six times over sixty seconds and gave up; NuGet made the
  // package visible about six and a half minutes after the push. With ninety
  // second intervals that is the fifth attempt, well inside the new budget.
  const { calls, probe } = scriptedProbe([404, 404, 404, 404, 200]);
  const slept = [];
  const { available, attempts } = await waitForPackage({
    registryId: "nuget",
    name: "Lino.Objects.Codec",
    version: "0.2.0",
    probe,
    sleepFn: async (seconds) => slept.push(seconds),
    log: () => {},
  });

  assert.equal(available, true);
  assert.equal(attempts, 5);
  assert.equal(calls.length, 5);
  assert.deepEqual(slept, [90, 90, 90, 90]);
});

test("the NuGet budget covers the documented fifteen minute indexing window", () => {
  const { maxAttempts, delaySeconds } = REGISTRIES.nuget;
  assert.ok(
    (maxAttempts - 1) * delaySeconds >= 15 * 60,
    "NuGet readback must wait at least fifteen minutes",
  );
});

test("every registry waits at least five minutes", () => {
  for (const [id, registry] of Object.entries(REGISTRIES)) {
    const budget = (registry.maxAttempts - 1) * registry.delaySeconds;
    assert.ok(budget >= 5 * 60, `${id} budget is only ${budget}s`);
  }
});

test("a version that never appears fails after exhausting the budget", async () => {
  const { probe } = scriptedProbe([404]);
  const { available, attempts } = await waitForPackage({
    registryId: "crates",
    name: "lino-objects-codec",
    version: "9.9.9",
    maxAttempts: 3,
    delaySeconds: 1,
    probe,
    sleepFn: async () => {},
    log: () => {},
  });
  assert.equal(available, false);
  assert.equal(attempts, 3);
});

test("a network error costs one attempt instead of aborting the wait", async () => {
  let call = 0;
  const probe = async () => {
    call++;
    if (call === 1) {
      return {
        available: false,
        status: "network-error",
        url: "https://example.invalid",
        error: "getaddrinfo ENOTFOUND",
      };
    }
    return { available: true, status: 200, url: "https://example.invalid" };
  };
  const { available, attempts } = await waitForPackage({
    registryId: "npm",
    name: "lino-objects-codec",
    version: "0.5.0",
    probe,
    sleepFn: async () => {},
    log: () => {},
  });
  assert.equal(available, true);
  assert.equal(attempts, 2);
});

test("probe URLs match each registry's version endpoint", () => {
  assert.equal(
    buildProbeUrl({
      registryId: "nuget",
      name: "Lino.Objects.Codec",
      version: "0.2.0",
    }),
    "https://api.nuget.org/v3-flatcontainer/lino.objects.codec/0.2.0/lino.objects.codec.nuspec",
  );
  assert.equal(
    buildProbeUrl({
      registryId: "pypi",
      name: "lino-objects-codec",
      version: "0.2.0",
    }),
    "https://pypi.org/pypi/lino-objects-codec/0.2.0/json",
  );
  assert.equal(
    buildProbeUrl({
      registryId: "crates",
      name: "lino-objects-codec",
      version: "0.4.0",
    }),
    "https://crates.io/api/v1/crates/lino-objects-codec/0.4.0",
  );
  assert.equal(
    buildProbeUrl({
      registryId: "npm",
      name: "lino-objects-codec",
      version: "0.5.0",
    }),
    "https://registry.npmjs.org/lino-objects-codec/0.5.0",
  );
});

test("a trailing slash on the base URL does not double up", () => {
  assert.equal(
    buildProbeUrl({
      registryId: "npm",
      baseUrl: "https://registry.npmjs.org/",
      name: "x",
      version: "1.0.0",
    }),
    "https://registry.npmjs.org/x/1.0.0",
  );
});

test("command line options beat environment variables, which beat defaults", () => {
  const fromCli = parseArgs(
    ["--registry", "nuget", "--name", "A", "--version", "1.0.0", "--max-attempts", "3"],
    { REGISTRY_WAIT_MAX_ATTEMPTS: "7" },
  );
  assert.equal(fromCli.maxAttempts, 3);

  const fromEnv = parseArgs(["--registry", "nuget", "--name", "A", "--version", "1.0.0"], {
    REGISTRY_WAIT_MAX_ATTEMPTS: "7",
  });
  assert.equal(fromEnv.maxAttempts, 7);

  const fromDefault = parseArgs(
    ["--registry", "nuget", "--name", "A", "--version", "1.0.0"],
    {},
  );
  assert.equal(fromDefault.maxAttempts, REGISTRIES.nuget.maxAttempts);
});

test("--flag=value is accepted as well as --flag value", () => {
  assert.deepEqual(readCliOptions(["--registry=npm", "--name", "a"]), {
    registry: "npm",
    name: "a",
  });
});

test("verbose is off by default and can be switched on either way", () => {
  const base = ["--registry", "npm", "--name", "a", "--version", "1.0.0"];
  assert.equal(parseArgs(base, {}).verbose, false);
  assert.equal(parseArgs([...base, "--verbose"], {}).verbose, true);
  assert.equal(parseArgs(base, { REGISTRY_WAIT_VERBOSE: "1" }).verbose, true);
  assert.equal(parseArgs(base, { REGISTRY_WAIT_VERBOSE: "0" }).verbose, false);
});

test("verbose mode prints the probe URL and the elapsed budget", async () => {
  const { lines, log } = recorder();
  const { probe } = scriptedProbe([200]);
  await waitForPackage({
    registryId: "npm",
    name: "a",
    version: "1.0.0",
    verbose: true,
    probe,
    sleepFn: async () => {},
    log,
  });
  assert.ok(lines.some((line) => line.includes("probe url:")));
  assert.ok(lines.some((line) => line.includes("budget")));
});

test("quiet mode prints one line per attempt and no probe detail", async () => {
  const { lines, log } = recorder();
  const { probe } = scriptedProbe([200]);
  await waitForPackage({
    registryId: "npm",
    name: "a",
    version: "1.0.0",
    probe,
    sleepFn: async () => {},
    log,
  });
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("probe url:"));
});

test("an unknown registry is rejected", () => {
  assert.throws(
    () => parseArgs(["--registry", "maven", "--name", "a", "--version", "1"], {}),
    /--registry must be one of/,
  );
});

test("a non-positive budget is rejected", () => {
  assert.throws(
    () =>
      parseArgs(
        ["--registry", "npm", "--name", "a", "--version", "1", "--max-attempts", "0"],
        {},
      ),
    /positive integer/,
  );
});

test("main requires a name and a version", async () => {
  const { lines, log } = recorder();
  const code = await main({
    argv: ["--registry", "npm"],
    env: {},
    log,
    logError: log,
  });
  assert.equal(code, 1);
  assert.ok(lines.some((line) => line.includes("--name and --version are required")));
});

test("main's failure message distinguishes slow indexing from a failed publish", async () => {
  const { lines, log } = recorder();
  const code = await main({
    argv: [
      "--registry",
      "npm",
      "--name",
      "lino-objects-codec",
      "--version",
      "9.9.9",
      "--max-attempts",
      "1",
      "--delay-seconds",
      "1",
      "--base-url",
      "https://registry.invalid",
    ],
    env: {},
    log,
    logError: log,
  });
  assert.equal(code, 1);
  const message = lines.join("\n");
  assert.ok(message.includes("still indexing"));
  assert.ok(message.includes("REGISTRY_WAIT_VERBOSE=1"));
});

test("probeOnce reports a network failure without throwing", async () => {
  const result = await probeOnce({
    registryId: "npm",
    name: "a",
    version: "1.0.0",
    fetchImpl: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(result.available, false);
  assert.equal(result.status, "network-error");
  assert.equal(result.error, "boom");
});

test("probes identify themselves, because crates.io rejects anonymous clients", async () => {
  // crates.io answers 403 with "in violation of our API data access policy" to
  // requests without a descriptive User-Agent, which would report a published
  // crate as missing. Verified live against 0.4.0: 403 without, 200 with.
  let seen;
  await probeOnce({
    registryId: "crates",
    name: "lino-objects-codec",
    version: "0.4.0",
    fetchImpl: async (url, init) => {
      seen = init;
      return { status: 200 };
    },
  });
  assert.equal(seen.headers["User-Agent"], USER_AGENT);
  assert.match(USER_AGENT, /lino-objects-codec/);
});
