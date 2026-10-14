import type { JobApplicationProfile } from "~/types/profile";
import type { FieldDescription } from "./fields";

/**
 * One integration per ATS / job-board platform.
 *
 * Each adapter owns everything platform-specific: which hosts it covers,
 * its field locators, and how it copes with that site's rendering quirks.
 * Adding a platform = adding a file + registering it in ./index.ts.
 */
export interface PlatformAdapter {
  /** Short identifier used in logs and status messages. */
  readonly id: string;
  /**
   * Host names this adapter handles — matches the exact host or any
   * subdomain of it.
   */
  readonly hosts: readonly string[];
  /**
   * Fill whatever profile fields this platform exposes. Returns the
   * number of fields written (0 = nothing happened). May be async —
   * autocomplete dropdowns require waiting for the option to be clicked.
   *
   * Must never throw into the caller.
   */
  autofill(profile: JobApplicationProfile): number | Promise<number>;
  /**
   * Describes exactly the fields {@link autofill} could write on the page
   * as currently rendered — one entry per field, in fill order. Empty
   * when this page renders none of the adapter's fields.
   *
   * A pure read of the live DOM (no side effects, no writes), so a UI can
   * show the user precisely what a click would fill before they click it.
   */
  describe(profile: JobApplicationProfile): FieldDescription[];
}
