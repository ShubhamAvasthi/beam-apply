import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

/**
 * Unit and DOM tests, run with `bun run test`.
 *
 * (Not `bun test` — that is Bun's own built-in test runner, not the `test`
 * script in package.json. It ignores this config, so the tests fail.)
 *
 * `WxtVitest` applies the same setup the extension is built with: the `@/`
 * and `~/` path aliases, WXT auto-imports (e.g. `createLogger`), and an
 * in-memory fake of the `browser` extension API so `browser.storage` works
 * in tests.
 *
 * happy-dom stands in for the browser. It has no layout engine — every
 * element measures 0×0 — so behaviour that depends on real rendering
 * (dropdown visibility, click coordinates) can't be verified here.
 */
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        // Fixtures can be saved copies of real pages that reference remote
        // scripts and stylesheets. Never fetch them — tests stay offline and
        // deterministic.
        settings: {
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
    setupFiles: ["tests/setup.ts"],
    // The extension's own log lines are only shown for failing tests, where
    // they explain what the adapter saw; passing runs stay readable.
    silent: "passed-only",
  },
});
