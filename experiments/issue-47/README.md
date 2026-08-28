# Cross-implementation round trip at `links-notation` 0.16.1

Issue #47 asks for a check that "a document written by each implementation reads
back identically in the other three" once all four pin the same parser version.

Each program here does two things:

- `write <path>` -- encode one fixed record with `encodeLine` and write it out.
- `read <dir>` -- decode every `*.lino` in the directory and print
  `encodeLine(decoded)` for each.

Re-encoding is what makes the comparison language-agnostic: there is no shared
value type across Rust, JavaScript, Python and C#, but there is a shared text
format, so if every implementation reads every document to the same value, all
sixteen re-encodings are the same string.

Run it with:

```bash
./experiments/issue-47/run.sh
```

The Rust and C# drivers are separate throwaway projects that path-reference the
real packages, so nothing here changes what the crate, the npm package or the
NuGet package ship.
