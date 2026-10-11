## Summary

Issue #117 removed `queue: max` from the writer jobs' concurrency blocks because actionlint v1.7.12 reports:

```text
unexpected key "queue" for "concurrency" section. expected one of "cancel-in-progress", "group"
```

The issue's premise was that "GitHub Actions concurrency supports only `group` and `cancel-in-progress`". That is no longer true.

GitHub documents `queue` in both the [concurrency how-to](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) and the [workflow syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) (both checked on 2026-10-11):

> To allow more than one `pending` job or workflow run to wait in the same concurrency group, use the optional `queue` property.
> - `single` (default): At most one job or workflow run can be `pending` in the concurrency group. When a new job or workflow run is queued, any existing `pending` job or workflow run in the same group is canceled and replaced.
> - `max`: Up to 100 jobs or workflow runs can be `pending` in the concurrency group.
>
> The combination of `queue: max` and `cancel-in-progress: true` is not allowed and will result in a workflow validation error.

CI/CD best practice #10 in [hive-mind's CI-CD-BEST-PRACTICES.md](https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md) asks for exactly this: "If every queued write must run, add `queue: max` to the writer's concurrency block".

actionlint is simply behind the schema: support is in the still-open [rhysd/actionlint#654](https://github.com/rhysd/actionlint/pull/654), and the latest release is v1.7.12 (2026-03-30).

## Impact

With the default `queue: single`, a third writer (release, manual release, generated-content push) that arrives while one writer runs and another waits **cancels the waiting one**. A release that was due to run is then reported as cancelled (grey) rather than run. This can happen with two quick merges to `main` plus a manual release.

## Reproduce

1. Put a writer job behind `concurrency: { group: w, cancel-in-progress: false }` with `run: sleep 120`.
2. Dispatch it three times in quick succession. Per the documentation quoted above, the second run is cancelled when the third starts waiting.
3. Add `queue: max` and repeat. All three runs complete, in order.

## Workaround / suggested fix

Restore `queue: max` on the write jobs and keep actionlint strict for everything else by ignoring just this one message until #654 is released:

```yaml
      - uses: docker://rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 # v1.7.12
        with:
          # `queue:` is documented workflow syntax but newer than actionlint's
          # bundled schema. Drop the -ignore once rhysd/actionlint#654 ships.
          args: -color -ignore "unexpected key .queue. for .concurrency. section"
```

The `.` wildcards avoid nested quotes, which the `docker://` `args:` splitter would mangle. This is in production in [lino-objects-codec#72](https://github.com/link-foundation/lino-objects-codec/pull/72) (`.github/workflows/workflows.yml`, with `queue: max` on every `main-writer-${{ github.repository }}` job).

Found while working on link-foundation/lino-objects-codec#71.
