# Retained transitive versions

All direct requirements match registry latest. These older indirect resolutions remain for the specific reasons below; they are not presented as updated to latest. The complete table includes every occurrence. The root npm tree has an unresolved security blocker: npm 12.2.2 bundles glob 13.0.6 and minimatch 10.2.5, affected by GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249. npm audit reports 21 propagated moderate findings from those two advisories. Other ecosystem audits report no known vulnerabilities. This does not satisfy the zero-unresolved-advisories requirement.

npm 12.2.2 publishes its CLI dependencies bundled inside the integrity-checked tarball; consumer overrides do not replace them. An upstream report already tracks the missing fix: https://github.com/npm/cli/issues/10299#issuecomment-6879318834. Changing those vendored packages would fork npm rather than install the released CLI; no tested official fixed release exists today. The default-branch audit fails explicitly with the required upstream release and repository update instructions. Under the user-requested external-action fallback, PRs narrowly defer enforcement of these two recorded advisories only in the exact official npm 12.2.2 bundle. Reports remain visible; new findings, application findings, changed bundles and audit errors still fail. For other npm packages, the table identifies the current parent and its declared range. A newer child major cannot be forced across that range without migrating the parent API (many switch CJS to ESM or change return values). Parents are themselves current; their tested dependency contracts are retained instead of silently overriding unrelated major APIs. Our narrowly scoped parser overrides are exercised by an actual command/configuration integration test.

Scriv 1.8.1 requires exact click==8.5.0 and markdown-it-py==4.2.0. Keeping those is required for a valid resolver result. The upstream report includes both newer registry releases: https://github.com/nedbat/scriv/issues/209#issuecomment-6878955200. Hash-locked installs and pip-audit pass; no dependency constraints are weakened.

getrandom 0.4.3 requires r-efi ^6 for the conditional UEFI backend; 7.2.0 is a different major. Upstream already merged the upgrade into unreleased 0.4.4: https://github.com/rust-random/getrandom/pull/869 and https://github.com/rust-random/getrandom/blob/master/CHANGELOG.md. Preserve support for that platform and the released parent rather than patch Cargo metadata or use unreleased Git code.

| Ecosystem | Package | Retained | Latest | Lock | Published parent constraint / reason |
| --- | --- | --- | --- | --- | --- |
| npm | @sec-ant/readable-stream | 0.4.1 | 0.7.1 | package-lock.json | get-stream@9.0.1 requires ^0.4.1 |
| npm | ansi-styles | 6.2.3 | 7.0.0 | package-lock.json | wrap-ansi@9.0.2 requires ^6.2.1 |
| npm | string-width | 7.2.0 | 9.0.0 | package-lock.json | cliui@9.0.1 requires ^7.2.0; wrap-ansi@9.0.2 requires ^7.0.0 |
| npm | commander | 14.0.3 | 15.1.0 | package-lock.json | peggy@5.1.1 requires ^14.0.3 |
| npm | emoji-regex | 10.6.0 | 11.0.0 | package-lock.json | string-width@7.2.0 requires ^10.3.0 |
| npm | isexe | 2.0.0 | 4.0.0 | package-lock.json | which@2.0.2 requires ^2.0.0 |
| npm | node-addon-api | 7.1.1 | 8.9.2 | package-lock.json | node-pty@1.1.0 requires ^7.1.0 |
| npm | @npmcli/package-json | 8.0.0 | 8.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @npmcli/query | 5.0.0 | 6.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @sigstore/bundle | 5.0.0 | 5.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @sigstore/protobuf-specs | 0.5.1 | 0.5.2 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @sigstore/sign | 5.0.0 | 5.1.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @sigstore/tuf | 5.0.0 | 5.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @sigstore/verify | 4.1.0 | 4.1.3 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | @tufjs/models | 5.0.0 | 5.0.2 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | balanced-match | 4.0.4 | 5.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | read-cmd-shim | 7.0.0 | 7.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | binary-extensions | 3.1.0 | 3.2.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | brace-expansion | 5.0.12 | 5.0.13 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | cacache | 21.0.1 | 21.0.2 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | chalk | 5.6.2 | 6.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | ci-info | 4.4.0 | 4.5.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | cidr-regex | 6.0.0 | 7.1.2 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | diff | 8.0.4 | 9.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | env-paths | 2.2.1 | 4.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | glob | 13.0.6 | 14.0.6 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | graceful-fs | 4.2.11 | 4.2.12 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | ip-address | 10.7.5 | 10.7.6 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | is-cidr | 7.0.0 | 7.0.3 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | lru-cache | 11.5.2 | 11.5.3 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | minimatch | 10.2.5 | 11.0.8 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | minipass-fetch | 6.0.0 | 6.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | minipass-flush | 1.0.6 | 2.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | minipass-pipeline | 1.2.4 | 3.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | minipass | 3.3.6 | 7.1.3 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | yallist | 4.0.0 | 5.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | negotiator | 1.0.0 | 1.1.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | node-gyp | 13.0.0 | 13.1.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | npm-packlist | 11.3.0 | 11.3.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | p-map | 7.0.5 | 7.1.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | path-scurry | 2.0.2 | 3.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | postcss-selector-parser | 7.1.6 | 7.2.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | proggy | 4.0.0 | 5.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | sigstore | 5.0.0 | 5.0.1 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | socks | 2.8.9 | 2.8.10 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | spdx-expression-parse | 4.0.0 | 5.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | spdx-license-ids | 3.0.23 | 3.0.24 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | supports-color | 10.2.2 | 11.0.0 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | tar | 7.5.22 | 7.5.23 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | picomatch | 4.0.5 | 4.0.7 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | tuf-js | 6.0.0 | 6.0.2 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | undici | 6.29.1 | 8.12.4 | package-lock.json | Bundled in the released npm@12.2.2 CLI (inBundle=true) |
| npm | parse-ms | 4.0.0 | 5.0.0 | package-lock.json | pretty-ms@9.3.1 requires ^4.0.0 |
| npm | path-key | 3.1.1 | 4.0.0 | package-lock.json | cross-spawn@7.0.6 requires ^3.1.0 |
| npm | pretty-ms | 9.3.1 | 10.0.0 | package-lock.json | execa@10.2.1 requires ^9.3.1 |
| npm | shebang-regex | 3.0.0 | 4.0.0 | package-lock.json | shebang-command@2.0.0 requires ^3.0.0 |
| npm | string-width | 8.3.0 | 9.0.0 | package-lock.json | yargs@18.2.0 requires ^8.2.1 |
| npm | unicorn-magic | 0.3.0 | 0.4.1 | package-lock.json | npm-run-path@6.0.0 requires ^0.3.0 |
| npm | which | 2.0.2 | 7.0.0 | package-lock.json | cross-spawn@7.0.6 requires ^2.0.1 |
| npm | wrap-ansi | 9.0.2 | 10.0.2 | package-lock.json | cliui@9.0.1 requires ^9.0.0 |
| npm | eslint-visitor-keys | 3.4.3 | 5.0.1 | js/package-lock.json | @eslint-community/eslint-utils@4.10.1 requires ^3.4.3 |
| npm | @humanfs/core | 0.19.2 | 0.20.0 | js/package-lock.json | @humanfs/node@0.16.8 requires ^0.19.2 |
| npm | @humanfs/node | 0.16.8 | 0.17.0 | js/package-lock.json | eslint@10.15.0 requires ^0.16.8 |
| npm | @humanfs/types | 0.15.0 | 0.16.0 | js/package-lock.json | @humanfs/core@0.19.2 requires ^0.15.0; @humanfs/node@0.16.8 requires ^0.15.0 |
| npm | @keyv/bigmap | 1.3.1 | 6.1.0 | js/package-lock.json | @cacheable/memory@2.2.0 requires ^1.3.1 |
| npm | @pnpm/deps.graph-sequencer | 1100.0.1 | 1101.0.1 | js/package-lock.json | @changesets/cli@3.0.3 requires ^1100.0.1 |
| npm | ajv | 6.15.0 | 8.20.0 | js/package-lock.json | eslint@10.15.0 requires ^6.14.0 |
| npm | balanced-match | 4.0.4 | 5.0.0 | js/package-lock.json | brace-expansion@5.0.13 requires ^4.0.2 |
| npm | escape-string-regexp | 4.0.0 | 5.0.0 | js/package-lock.json | eslint@10.15.0 requires ^4.0.0 |
| npm | fast-levenshtein | 2.0.6 | 3.0.0 | js/package-lock.json | optionator@0.9.4 requires ^2.0.6 |
| npm | find-up | 5.0.0 | 8.0.0 | js/package-lock.json | eslint@10.15.0 requires ^5.0.0 |
| npm | hashery | 1.5.1 | 3.0.6 | js/package-lock.json | @cacheable/utils@2.5.0 requires ^1.5.1; @keyv/bigmap@1.3.1 requires ^1.4.0 |
| npm | hookified | 1.15.1 | 3.1.0 | js/package-lock.json | @cacheable/memory@2.2.0 requires ^1.15.1; @keyv/bigmap@1.3.1 requires ^1.15.0; cacheable@2.5.0 requires ^1.15.0; flat-cache@6.1.23 requires ^1.15.0; hashery@1.5.1 requires ^1.15.0 |
| npm | ignore | 5.3.2 | 7.0.14 | js/package-lock.json | eslint@10.15.0 requires ^5.2.0 |
| npm | isexe | 2.0.0 | 4.0.0 | js/package-lock.json | which@2.0.2 requires ^2.0.0 |
| npm | json-schema-traverse | 0.4.1 | 1.0.0 | js/package-lock.json | ajv@6.15.0 requires ^0.4.1 |
| npm | keyv | 5.6.0 | 6.1.0 | js/package-lock.json | @cacheable/memory@2.2.0 requires ^5.6.0; @cacheable/utils@2.5.0 requires ^5.6.0; cacheable@2.5.0 requires ^5.6.0 |
| npm | locate-path | 6.0.0 | 8.0.0 | js/package-lock.json | find-up@5.0.0 requires ^6.0.0 |
| npm | p-limit | 3.1.0 | 7.3.3 | js/package-lock.json | p-locate@5.0.0 requires ^3.0.2 |
| npm | p-locate | 5.0.0 | 7.0.0 | js/package-lock.json | locate-path@6.0.0 requires ^5.0.0 |
| npm | path-exists | 4.0.0 | 5.0.0 | js/package-lock.json | find-up@5.0.0 requires ^4.0.0 |
| npm | path-key | 3.1.1 | 4.0.0 | js/package-lock.json | cross-spawn@7.0.6 requires ^3.1.0 |
| npm | qified | 0.10.1 | 0.13.2 | js/package-lock.json | cacheable@2.5.0 requires ^0.10.1 |
| npm | hookified | 2.2.0 | 3.1.0 | js/package-lock.json | qified@0.10.1 requires ^2.1.1 |
| npm | shebang-regex | 3.0.0 | 4.0.0 | js/package-lock.json | shebang-command@2.0.0 requires ^3.0.0 |
| npm | string-argv | 0.3.2 | 0.4.0 | js/package-lock.json | lint-staged@17.6.0 requires ^0.3.2 |
| npm | which | 2.0.2 | 7.0.0 | js/package-lock.json | cross-spawn@7.0.6 requires ^2.0.1 |
| npm | yocto-queue | 0.1.0 | 1.2.2 | js/package-lock.json | p-limit@3.1.0 requires ^0.1.0 |
| pypi | click | 8.5.0 | 8.5.1 | python/requirements-dev.lock | Scriv 1.8.1 exact requirement; upstream report 209 above |
| pypi | markdown-it-py | 4.2.0 | 4.3.0 | python/requirements-dev.lock | Scriv 1.8.1 exact requirement; upstream report 209 above |
| cargo | r-efi | 6.0.0 | 7.2.0 | rust/Cargo.lock | getrandom 0.4.3 UEFI backend requires ^6; upstream 869 merged, not released |
