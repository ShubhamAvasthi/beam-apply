/**
 * Loads the application-page fixture into happy-dom's document.
 *
 * By default this is the committed fixture below. Setting
 * `BEAMAPPLY_FIXTURE=/path/to/page.html` runs the same tests against any
 * other saved page — e.g. a real application form kept outside the repo:
 *
 *   BEAMAPPLY_FIXTURE=~/Downloads/application.html bun run test
 *
 * A saved page only contains static markup: dropdown menus that a site
 * renders with JavaScript are not part of it, and nothing on it reacts to
 * input. Tests built on the fixture can therefore check what the adapter
 * finds and writes, but not what the page's own scripts do afterwards.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_ENV_VAR = "BEAMAPPLY_FIXTURE";

// Built from the path string, not `new URL(…)`: under happy-dom the global
// `URL` is happy-dom's own class, which Node's `fileURLToPath` rejects.
const DEFAULT_FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/greenhouse-application.html",
);

function resolveFixturePath(): string {
  const override = process.env[FIXTURE_ENV_VAR];
  if (!override) return DEFAULT_FIXTURE;

  // Shells don't expand `~` in every position (or at all, on Windows).
  const expanded = override.replace(/^~(?=$|[\\/])/, homedir());
  const resolved = path.resolve(expanded);
  if (!existsSync(resolved)) {
    // Fail loudly: silently falling back to the default fixture would make
    // a typo look like a passing run against the real page.
    throw new Error(`${FIXTURE_ENV_VAR} points to a missing file: ${resolved}`);
  }
  return resolved;
}

const fixturePath = resolveFixturePath();
const fixtureHtml = readFileSync(fixturePath, "utf8");

/** File name of the fixture in use — shown in test names. */
export const fixtureName = path.basename(fixturePath);

/**
 * Whether the fixture contains an element matching `selector`. Lets a test
 * skip itself on pages that don't render a field (not every application
 * asks for a phone number or a resume) instead of failing.
 */
export function fixtureHas(selector: string): boolean {
  return (
    new DOMParser()
      .parseFromString(fixtureHtml, "text/html")
      .querySelector(selector) !== null
  );
}

/**
 * Replaces the document body with a fresh copy of the fixture. Call it
 * before each test: filling mutates the DOM.
 *
 * Scripts, `<noscript>` fallbacks and iframes are dropped. happy-dom is
 * already configured not to run or fetch them (see vitest.config.ts);
 * removing them also keeps a saved page's tracking and embed markup out of
 * the DOM the tests query.
 */
export function mountFixture(): void {
  const parsed = new DOMParser().parseFromString(fixtureHtml, "text/html");
  for (const element of parsed.querySelectorAll("script, noscript, iframe")) {
    element.remove();
  }
  document.body.innerHTML = parsed.body.innerHTML;
}
