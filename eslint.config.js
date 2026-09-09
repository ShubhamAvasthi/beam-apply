import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Minimal lint setup: `js.configs.recommended` for JS/JSON logic rules,
 * `tseslint.configs.recommended` (non-type-aware) for TypeScript — tsc
 * already runs as `bun compile`, so lint stays about code quality, not
 * types. Type-aware rules can be layered in later if needed.
 */
export default tseslint.config(
  {
    // WXT build output and generated types.
    ignores: ['.output/**', '.wxt/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
