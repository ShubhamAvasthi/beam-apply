import type { JobApplicationProfile } from '~/types/profile';

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
}