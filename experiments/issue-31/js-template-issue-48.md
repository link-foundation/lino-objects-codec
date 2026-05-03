## Problem

The current template `scripts/setup-npm.mjs` documents that npm trusted publishing requires npm >= 11.5.1, but the fallback/success logic can still leave the workflow below that requirement:

- The curl fallback installs `https://registry.npmjs.org/npm/-/npm-11.4.2.tgz`, which is below the documented trusted-publishing minimum.
- If all install strategies fail, the script treats any npm major >= 11 as acceptable, even when the version is 11.0.0-11.5.0.
- The script does not re-check the final npm version against >= 11.5.1 before returning success.

npm's docs currently state that trusted publishing requires npm CLI 11.5.1 or later and Node.js 22.14.0 or higher:

https://docs.npmjs.com/trusted-publishers

## Downstream Evidence

While fixing link-foundation/lino-objects-codec#31, the JavaScript release run showed the same setup path failing to upgrade npm on GitHub Actions:

- Run: https://github.com/link-foundation/lino-objects-codec/actions/runs/25286485840
- Log evidence: bundled npm 10.9.7 failed with `Cannot find module 'promise-retry'`, then setup printed `Updated npm version: 10.9.7` and continued to publish.
- The publish later failed with npm E404/access/trusted-publisher symptoms.

## Reproduction

1. Use the current template `scripts/setup-npm.mjs`.
2. Force the standard npm install path to fail, so the curl fallback runs.
3. Observe that the fallback installs npm 11.4.2, which is below the documented trusted-publishing minimum.
4. Alternatively, make all fallback strategies fail while the current npm is any 11.x below 11.5.1; the script accepts it by major version only.

## Suggested Fix

- Parse versions numerically and enforce npm >= 11.5.1, not just major >= 11.
- Enforce Node.js >= 22.14.0 before publish setup.
- Resolve the latest npm 11.x >= 11.5.1 from registry metadata for the tarball fallback instead of pinning 11.4.2.
- After all strategies, re-run `npm --version` and fail if the result is still below 11.5.1.

This is the approach being applied downstream in link-foundation/lino-objects-codec#32.
