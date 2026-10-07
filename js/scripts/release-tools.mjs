import { appendFileSync } from 'node:fs';

/** Append release step outputs when running under GitHub Actions. */
export function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

/** Load the shared tools used by release commands, only when invoked. */
export async function loadReleaseTools(
  { configuration = true } = {},
  fetchSource = globalThis.fetch
) {
  const { use } = eval(
    await (await fetchSource('https://unpkg.com/use-m/use.js')).text()
  );
  const { $ } = await use('command-stream');
  return configuration ? { $, ...(await use('lino-arguments')) } : { $ };
}

/** Common named options; --release-version avoids yargs' --version flag. */
export function releaseArguments(
  { yargs, getenv },
  versionDescription = 'Version number (e.g., 1.0.0)'
) {
  return yargs
    .option('release-version', {
      type: 'string',
      default: getenv('VERSION', ''),
      describe: versionDescription,
    })
    .option('repository', {
      type: 'string',
      default: getenv('REPOSITORY', ''),
      describe: 'GitHub repository (e.g., owner/repo)',
    });
}
