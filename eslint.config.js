import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Minimal lint setup: `js.configs.recommended` for JS logic rules,
 * `tseslint.configs.recommended` (non-type-aware) for TypeScript — tsc
 * already runs as `bun compile`, so lint stays about code quality, not
 * types. Type-aware rules can be layered in later if needed.
 *
 * Configs are composed with ESLint core's `defineConfig` — typescript-
 * eslint's own `tseslint.config` helper is deprecated in its favor.
 */
export default defineConfig(
  globalIgnores([
    // WXT build output and generated types.
    '.output/**',
    '.wxt/**',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
);



