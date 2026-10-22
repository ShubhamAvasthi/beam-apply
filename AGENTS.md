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

## Preferred mechanism order for read-write operations

When reading or writing files, use mechanisms in this order of preference:

1. AI tool's mechanism — read_files, editor, search_codebase, etc.
   These are preferred because they operate directly on file content without
   spawning shells or opening views the human must scroll through.
2. Non-interactive shell commands — run_commands with flags that avoid
   prompts/pagers (e.g. git --no-pager, --non-interactive). Use only when
   the AI tool's mechanism cannot accomplish the task.
3. Interactive commands — only as the last resort. For example, git diff
   opens a small view that forces the human to scroll — absolutely undesired.
   Never use interactive commands when a non-interactive alternative exists.

## Build before summarizing

Always run `bun run build` before summarizing changes so the user can easily test the changes.

## Never commit or push without being asked

Never commit or push changes without being explicitly asked by the user. Make edits locally, but wait for explicit permission before committing or pushing.
