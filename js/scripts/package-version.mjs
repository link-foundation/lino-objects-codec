import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Read the package in the caller's directory, including from a Git ref. */
export function packageVersion({ ref, cwd = process.cwd() } = {}) {
  const source = ref
    ? execFileSync('git', ['show', `${ref}:./package.json`], {
        cwd,
        encoding: 'utf8',
      })
    : readFileSync(join(cwd, 'package.json'), 'utf8');
  return JSON.parse(source).version;
}
