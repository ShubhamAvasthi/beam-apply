# AGENTS.md

Guidance for AI coding agents working in this repository.

## Release / version-bump commits

When you create a release (i.e. a commit that bumps `version` in
`package.json`), **always use this exact commit message format**:

```
Bump version to X.Y.Z
```

where `X.Y.Z` is the new version, without a leading `v` — for example
`Bump version to 1.4.0`. This mirrors previous releases and keeps the
release history consistent.

Notes:

- This message is for the **version-bump commit only** — the dedicated
  commit whose purpose is to publish a new version. Do not use it for
  ordinary feature/fix commits.
- `package.json` is the single source of truth for the extension version.
  After committing the bump, create and push a matching tag to trigger the
  Release workflow. The tag name
  keeps the `v` prefix (the workflow triggers on `v*`), but its message
  matches the commit: `git tag -a vX.Y.Z -m "Bump version to X.Y.Z" && git push origin main vX.Y.Z`.
- The tag must match the `package.json` version exactly, or the Release
  workflow's version-verification job fails.
