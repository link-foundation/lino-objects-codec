# Changelog Fragments

This directory contains changelog fragments that will be collected into `CHANGELOG.md` during releases.

## How to Add a Changelog Fragment

When making changes that should be documented in the changelog, create a fragment file:

```bash
# Create a file with the naming pattern: YYYYMMDD_HHMMSS_description.md
# Example:
touch changelog.d/20251231_120000_add_new_feature.md
```

## Fragment Format

Each fragment should contain a YAML frontmatter with the bump type, followed by markdown content organized by category:

```markdown
---
bump: patch  # or 'minor' or 'major'
---

### Added
- Description of new feature

### Changed
- Description of change to existing functionality

### Fixed
- Description of bug fix

### Removed
- Description of removed feature

### Deprecated
- Description of deprecated feature

### Security
- Description of security fix
```

## Bump Types

- **patch**: Bug fixes and minor changes that don't affect the API
- **minor**: New features that are backwards compatible
- **major**: Breaking changes to the API

## Why Fragments?

Using changelog fragments (similar to [Changesets](https://github.com/changesets/changesets) in JavaScript):

1. **No merge conflicts**: Multiple PRs can add fragments without conflicts
2. **Per-PR documentation**: Each PR documents its own changes
3. **Automated collection**: Fragments are automatically collected during release
4. **Consistent format**: Template ensures consistent changelog entries

## During Release

Fragments are automatically collected into `CHANGELOG.md` by the release workflow. The workflow:

1. Reads all `.md` files in this directory (except README.md)
2. Extracts the bump type from frontmatter
3. Uses the highest priority bump type (major > minor > patch)
4. Consolidates all entries into CHANGELOG.md
5. Deletes the processed fragment files
