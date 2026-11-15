/**
 * Preloaded by `bun test` only (see bunfig.toml): stops Bun's built-in test
 * runner before it loads any test file. The suite runs on Vitest, via
 * `bun run test`.
 */
console.error(
  "bun test is disabled: this project tests with Vitest. Run `bun run test` instead.",
);
process.exit(1);
