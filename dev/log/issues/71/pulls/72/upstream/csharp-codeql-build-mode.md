## Summary

`.github/workflows/security.yml` initialises CodeQL for `csharp` without `build-mode` and then runs `github/codeql-action/autobuild@v4`. On the current CodeQL action this logs a warning on every run, and the analysis cannot use CodeQL's incremental overlay database:

```text
##[warning]Cannot build an overlay-base database because build-mode is set to "undefined" instead of "none". Falling back to creating a normal full database instead.
```

## Evidence (downstream)

`link-foundation/lino-objects-codec` runs the same configuration. See the `CodeQL (csharp)` job in [Security run 38145827872](https://github.com/link-foundation/lino-objects-codec/actions/runs/38145827872) (push to `main`) and in [run 38154982941](https://github.com/link-foundation/lino-objects-codec/actions/runs/38154982941) (pull request).

## Reproduce

Run `security.yml` from the template unchanged. The `CodeQL (csharp)` job prints the warning above in the Initialize/Analyze steps.

## Suggested fix

CodeQL supports `build-mode: none` for C# (it analyses without compiling). This removes both the warning and the dependency on `autobuild` being able to build the solution:

```yaml
      - uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
          build-mode: none
      # (remove the autobuild step)
      - uses: github/codeql-action/analyze@v4
```

The rust template already does this (`.github/workflows/security.yml` there sets `build-mode: none`). If a full build is preferred, set `build-mode: autobuild` explicitly instead, so the mode is no longer `undefined`.

Applied in [lino-objects-codec#72](https://github.com/link-foundation/lino-objects-codec/pull/72) (`.github/workflows/security.yml`).

Found while working on link-foundation/lino-objects-codec#71.
