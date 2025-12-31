# Changesets for C# Package

This folder contains changelog fragments for the C# implementation of lino-objects-codec.

## What is a Changeset?

A changeset is a markdown file that describes a change you've made. Each PR that introduces user-facing changes should include a changeset file.

## Creating a Changeset

Create a new markdown file in this directory with the following naming pattern:

```
YYYYMMDD_HHMMSS_description.md
```

For example: `20251231_120000_add_feature.md`

### File Format

Each changeset file should have YAML frontmatter with the package name and version bump type, followed by a description:

```markdown
---
'Lino.Objects.Codec': patch
---

Description of the changes made in this PR.
```

### Version Bump Types

- **patch**: Bug fixes and minor changes (0.0.X)
- **minor**: New features that are backward compatible (0.X.0)
- **major**: Breaking changes (X.0.0)

## When to Create a Changeset

Create a changeset when:

- Adding new features
- Fixing bugs
- Making breaking changes
- Any change that affects users of the package

You don't need a changeset for:

- Documentation-only changes
- Internal refactoring that doesn't affect the API
- Test improvements

## Release Process

When changes are merged to main:

1. All changeset files are collected
2. The highest priority version bump is selected (major > minor > patch)
3. The version in the .csproj file is updated
4. CHANGELOG.md is updated with all changeset descriptions
5. A GitHub release is created
6. The package is published to NuGet

## Example Changeset

```markdown
---
'Lino.Objects.Codec': minor
---

Add support for encoding DateTimeOffset values.

This feature allows users to serialize DateTimeOffset objects, which are
automatically converted to ISO 8601 format during encoding.
```
