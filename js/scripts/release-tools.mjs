import { appendFileSync } from 'node:fs';

export { loadReleaseTools } from '../../scripts/release-tools.mjs';

/** Append release step outputs when running under GitHub Actions. */
export function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
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
