/**
 * BeamApply profile data model.
 *
 * Conventions (privacy-first, deterministic):
 * - Dates will be ISO 8601 strings when date fields are introduced —
 *   JSON-serializable and stable across contexts. Never store `Date`
 *   objects in extension storage.
 * - Fields are required by default: plain `string` with an empty `''`
 *   default. A field becomes `T | null` only when a real form allows it
 *   to be optional (`undefined` keys are silently dropped by JSON
 *   serialization).
 * - No analytics, tracking, or device identifiers are part of this model.
 */

// TODO(schema versioning): before this model grows beyond the name fields,
// reintroduce a `schemaVersion` field here and pass it as `version` to
// `storage.defineItem()` in utils/storage.ts — so future shape changes run
// migrations instead of silently mismatching already-saved profiles.

/**
 * Single source of truth for the profile’s SHAPE and its EMPTY/default
 * state. Adding or renaming a field here is the only change needed:
 * `PersonalInfo`, `JobApplicationProfile` and {@link createEmptyProfile}
 * are all derived from this one object, so there is no second definition
 * to keep in sync.
 *
 * Type conventions:
 * - `''` (or `[]`) widen to the mutable type when referenced.
 * - `null as X | null` keeps a nullable field’s type.
 */
const EMPTY_PROFILE = {
  personalInfo: {
    firstName: '',
    lastName: '',
    email: '',
  },
  updatedAt: null as string | null,
};

/** The user’s core identity details used for form filling. */
export type PersonalInfo = typeof EMPTY_PROFILE['personalInfo'];

/**
 * The complete job application profile persisted under `local:profile`.
 *
 * Intentionally minimal for now. Other sections will be added
 * iteratively by extending {@link EMPTY_PROFILE}.
 */
export type JobApplicationProfile = typeof EMPTY_PROFILE;

/**
 * A pristine, fully-structured profile with no user data.
 *
 * Returns a deep clone on every call, so callers can mutate their copy
 * without affecting the shared default object or each other. Contains no
 * random values or timestamps, keeping creation deterministic.
 */
export function createEmptyProfile(): JobApplicationProfile {
  return structuredClone(EMPTY_PROFILE);
}