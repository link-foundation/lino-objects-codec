---
'Lino.Objects.Codec': patch
---

Pack `README.md` into the NuGet package (`PackageReadmeFile`), removing the
"Readme missing" warning `dotnet pack` printed on every release, so the gallery
page renders the project documentation. Part of the CI/CD clean-up in
[issue #41](https://github.com/link-foundation/lino-objects-codec/issues/41),
which also makes the C# changeset check able to fail, enforces the 1500-line
file limit and finally runs the `csharp/scripts` unit tests in CI.
