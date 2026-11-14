While updating all dependency ecosystems in https://github.com/link-foundation/lino-objects-codec/pull/87, we found a buildless restore limitation after moving to stable .NET SDK 11.0.100 / net11.0. This follows the basic .NET 11 support in #22565; that merged PR addresses installation, whereas this report concerns dependency resolution.

Affected observed setup: github/codeql-action 4.39.3, bundled CodeQL 2.27.4, Ubuntu 24.04, .NET SDK 11.0.100. The setup-dotnet step successfully installs and selects the current SDK. C# buildless extraction nevertheless replaces TargetFrameworkRootPath and NetCoreTargetingPackRoot with an empty directory and every project restore fails, before falling back to individual package guessing. The job itself reports success, so reading just the check result misses this.

Actual CI evidence: https://github.com/link-foundation/lino-objects-codec/actions/runs/43607982453/job/132486640838 (Analyze, 15:02:54–15:03:11 UTC). A reusable reproduction is in experiments/issue-86/codeql-restore.sh in the linked PR. From its repository checkout using SDK 11.0.100:

```sh
project=csharp/src/Lino.Objects.Codec/Lino.Objects.Codec.csproj
scratch=$(mktemp -d)
dotnet restore "$project" --no-dependencies \
  /p:DisableImplicitNuGetFallbackFolder=true \
  "/p:TargetFrameworkRootPath=$scratch" \
  "/p:NetCoreTargetingPackRoot=$scratch" \
  /p:AllowMissingPrunePackageData=true
# NU1102: Unable to find package System.Numerics.Vectors with version (>= 4.5.0)
# Found 27 version(s) in nuget.org [ Nearest version: 4.5.0 ]
dotnet restore "$project" --locked-mode
dotnet build "$project" --no-restore --configuration Release --no-incremental \
  -p:UseSharedCompilation=false
# Build succeeded. 0 warnings, 0 errors.
rm -rf "$scratch"
```

The library's one external PackageReference is Link.Foundation.Links.Notation 0.31.1, the current NuGet release. Keeping the real SDK targeting packs restores and builds the exact lock successfully. All 541 tests also pass with the actual graph. The comparison changes only the CodeQL-style restore properties; it does not relax requirements or replace packages.

Our local workaround is the documented manual build mode for C#, with explicit locked restores/builds of the solution, example and interop consumer. Other languages remain buildless. Proposed upstream improvement: use installed .NET 11 targeting packs (or an equivalent correctly pruned dependency restore) before falling back to package guessing, and test buildless extraction of a net11.0 project referencing a netstandard dependency. Report incomplete dependency resolution in the check diagnostics rather than relying on a successful fallback extraction. The buildless fallback also guesses nonexistent package IDs from XML fixture strings in Python tests; using evaluated project assets would avoid those false fetches.
