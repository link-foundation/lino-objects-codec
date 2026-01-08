# Case Study: Rust CI/CD Failure - Yargs Reserved Word Conflict

**Issue:** [#22](https://github.com/link-foundation/lino-objects-codec/issues/22)
**Date of Failure:** 2026-01-08
**CI Run:** [#20828012412](https://github.com/link-foundation/lino-objects-codec/actions/runs/20828012412/job/59834479617)

## Executive Summary

The Rust CI/CD pipeline was failing during the "Auto Release" phase because the `create-github-release.mjs` script was unable to parse the `--version` command-line argument. The root cause was that `"version"` is a reserved word in yargs (the CLI argument parsing library used by `lino-arguments`), which caused the argument to be interpreted as yargs' built-in version display command instead of our custom option.

## Timeline of Events

1. **18:48:47 UTC** - CI pipeline triggered by push to main branch
2. **18:48:51 UTC** - "Detect Changes" job completed successfully
3. **18:48:58 - 18:49:48 UTC** - "Lint and Format Check", "Test", and "Build Package" jobs completed successfully
4. **18:50:06 UTC** - "Auto Release" job started
5. **18:50:11 UTC** - Git configured, changelog fragments detected (1 fragment, patch bump)
6. **18:50:11 UTC** - Version check passed (new version 0.2.0 detected)
7. **18:50:19 UTC** - Build and publish steps completed
8. **18:50:19 UTC** - "Create GitHub Release" step started
9. **18:50:24 UTC** - **FAILURE**: Script exited with "Missing required arguments"

## Root Cause Analysis

### The Error

```
Auto Release	Create GitHub Release	Error: Missing required arguments
Auto Release	Create GitHub Release	Usage: node scripts/create-github-release.mjs --version <version> --repository <repository>
Auto Release	Create GitHub Release	##[error]Process completed with exit code 1.
```

### The Command Executed

```bash
node scripts/create-github-release.mjs \
  --version "0.2.0" \
  --repository "link-foundation/lino-objects-codec" \
  --tag-prefix "rust-v"
```

### Investigation

The arguments were correctly passed to the script, but the script reported "Missing required arguments". This was puzzling because the arguments were clearly present in the command.

Upon testing locally, we discovered that the parsed `version` value was `false` instead of `"0.2.0"`:

```javascript
Parsed config: {
  "version": false,  // Expected: "0.2.0"
  "repository": "test/repo",
  "tagPrefix": "v"
}
```

Node.js also printed a warning:

```
Warning: "version" is a reserved word.
Please do one of the following:
- Disable version with `yargs.version(false)` if using "version" as an option
- Use the built-in `yargs.version` method instead (if applicable)
- Use a different option key
```

### Root Cause

The `lino-arguments` library uses [yargs](https://yargs.js.org/) internally for CLI argument parsing. In yargs v17.2.0+, `--version` is a reserved command that displays the application version and exits. When a user defines a custom `version` option, yargs exhibits unexpected behavior - it returns `false` instead of the actual argument value.

This is a known issue documented in:
- [yargs/yargs#2064](https://github.com/yargs/yargs/issues/2064)
- [CycloneDX/cdxgen#83](https://github.com/CycloneDX/cdxgen/issues/83)

## Solution

The fix is to call `.version(false)` on the yargs instance before defining the custom `version` option. This disables yargs' built-in `--version` handling and allows the custom option to be parsed correctly.

### Before (Broken)

```javascript
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('version', {
        type: 'string',
        default: getenv('VERSION', ''),
        describe: 'Version number (e.g., 1.0.0)',
      })
      // ... other options
});
```

### After (Fixed)

```javascript
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .version(false) // Disable yargs built-in --version handling
      .option('version', {
        type: 'string',
        default: getenv('VERSION', ''),
        describe: 'Version number (e.g., 1.0.0)',
      })
      // ... other options
});
```

## Affected Files

Three scripts were affected by this issue:

1. `rust/scripts/create-github-release.mjs` - **Primary failure point**
2. `rust/scripts/collect-changelog.mjs`
3. `csharp/scripts/create-github-release.mjs`

## Lessons Learned

1. **Reserved Words in Libraries**: When using CLI parsing libraries like yargs, be aware of reserved words that may conflict with your option names. Common reserved words in yargs include `version`, `help`, `$0`.

2. **Warning Messages**: Node.js and libraries often emit warnings before errors occur. In this case, the warning about "version" being a reserved word was available but not visible in the CI output until the failure occurred.

3. **Local Testing**: Testing scripts locally with the same arguments used in CI can help identify argument parsing issues that aren't obvious from CI logs alone.

4. **Error Messages Can Be Misleading**: The error "Missing required arguments" suggested the arguments weren't being passed, but the real issue was that they were being ignored due to a naming conflict.

## Prevention Measures

1. **Avoid Reserved Names**: Consider using alternative option names like `pkg-version`, `release-version`, or `ver` to avoid conflicts with reserved words.

2. **Always Use `.version(false)`**: When defining a custom `version` option in yargs, always disable the built-in version handling first.

3. **Add Integration Tests**: Create tests that verify the CLI scripts correctly parse all expected arguments.

## References

- [Yargs Documentation - version()](https://yargs.js.org/docs/#api-reference-version)
- [yargs/yargs#2064 - Cannot have version as both option and command](https://github.com/yargs/yargs/issues/2064)
- [CycloneDX/cdxgen#83 - Warning: "version" is a reserved word](https://github.com/CycloneDX/cdxgen/issues/83)
