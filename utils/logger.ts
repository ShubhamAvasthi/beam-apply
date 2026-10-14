/**
 * Namespaced console logger, wrapping `loglevel`.
 *
 * Every line is prefixed `[BeamApply]` (or `[BeamApply/<namespace>]`) so
 * extension output is instantly distinguishable from the host page's own
 * console noise — important because content scripts share the page
 * console. Call sites pass just the message; the prefix is applied here,
 * once, instead of being hand-interpolated in every file.
 *
 * We use `loglevel` rather than a hand-rolled wrapper for one concrete
 * reason: log LEVELS. A bespoke prefix helper can only ever print
 * everything, so `info`/`debug` lines would fire on every autofill for
 * every user — noise in their console. `loglevel` lets us gate the level
 * by build: verbose while developing, quiet (`warn` and above) in
 * production, without touching a single call site. `import.meta.env.DEV`
 * is statically replaced at build time (see utils/storage.ts), so the
 * level is fixed per bundle rather than checked at runtime.
 *
 * `loglevel` itself is dependency-free and ~1.5 kB, so this keeps the
 * extension's runtime-dependency surface minimal while giving us real
 * level control.
 */
import log from "loglevel";

// Verbose while developing; in production keep only warnings and errors,
// which is what a user (or a support conversation) actually needs to see.
log.setLevel(import.meta.env.DEV ? "DEBUG" : "WARN");

/** Prefix shared by every BeamApply log line. */
const PREFIX = "BeamApply";

/** A logger bound to a namespace. Method signatures match `console`. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Creates a logger whose lines are tagged `[BeamApply/<namespace>]`.
 *
 * Pass no namespace for the generic `[BeamApply]` prefix (shared code);
 * pass one (e.g. `"greenhouse"`, `"sidebar"`) to scope output to a
 * specific adapter or surface. Each namespace gets its own `loglevel`
 * instance so a future per-surface level override stays possible.
 */
export function createLogger(namespace?: string): Logger {
  const prefix = namespace ? `[${PREFIX}/${namespace}]` : `[${PREFIX}]`;
  // `getLogger(name)` returns a per-name instance; all share the level set
  // above. We keep one instance per namespace for forward-compatibility.
  const instance = namespace ? log.getLogger(namespace) : log;

  const forward =
    (method: "debug" | "info" | "warn" | "error") =>
    (...args: unknown[]): void => {
      instance[method](prefix, ...args);
    };

  return {
    debug: forward("debug"),
    info: forward("info"),
    warn: forward("warn"),
    error: forward("error"),
  };
}
