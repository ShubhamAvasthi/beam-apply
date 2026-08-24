/**
 * BeamApply profile data model.
 *
 * Conventions (privacy-first, deterministic):
 * - Dates will be ISO 8601 strings when date fields are introduced —
 *   JSON-serializable and stable across contexts. Never store `Date`
 *   objects in extension storage.
 * - Fields a user may legitimately leave blank will be `T | null`, never
 *   optional (`undefined` keys are silently dropped by JSON serialization).
 * - No analytics, tracking, or device identifiers are part of this model.
 */

// TODO(schema versioning): before this model grows beyond the name fields,
// reintroduce a `schemaVersion` constant here (mirrored as a `schemaVersion`
// field on JobApplicationProfile) and pass it as `version` to
// `storage.defineItem()` in utils/storage.ts — so future shape changes run
// migrations instead of silently mismatching already-saved profiles.

/** The user's core identity details used for form filling. */
export interface PersonalInfo {
  firstName: string;
  lastName: string;
}

/**
 * The complete job application profile persisted under `local:profile`.
 *
 * Intentionally minimal for now. Other sections will be added
 * iteratively over time.
 */
export interface JobApplicationProfile {
  personalInfo: PersonalInfo;
  /**
   * ISO 8601 instant of the last local save (`new Date().toISOString()`),
   * or `null` if never saved.
   */
  updatedAt: string | null;
}