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
/**
 * A resume file attached to the profile.
 *
 * The raw bytes are persisted as a base64 string (no `data:` prefix) so the
 * whole profile stays JSON-serializable under `browser.storage.local`. The
 * platform adapters rebuild a real `File` from these bytes at autofill time
 * and attach it to the requisition's upload field.
 */
export interface ResumeFile {
  /** Original file name on disk, e.g. "john-doe-resume.pdf". */
  name: string;
  /** MIME type reported by the OS when the file was picked. */
  mimeType: string;
  /** Size in bytes. */
  size: number;
  /** Base64-encoded file content — no prefix, no line breaks. */
  base64: string;
}

/**
 * A stored answer for a requisition-specific (custom) application question,
 * e.g. "immigration sponsorship" — "No".
 *
 * Matching is substring-based at fill time: the stored question only has to
 * appear within the question text the form renders (label / aria-label), and
 * the first rendered question containing it is filled — so one entry like
 * "immigration sponsorship" covers every company's phrasing. Keep fragments
 * distinctive: a short question can match an unrelated field. For dropdowns
 * the answer must exactly match one of the rendered option labels — nothing
 * is guessed. Radio and checkbox questions are never filled automatically.
 */
export interface CustomQuestion {
  /**
   * Distinctive fragment of the question text as it appears on the form;
   * the first rendered question containing it is filled.
   */
  question: string;
  /** Answer to fill — free text, or an option label for dropdowns. */
  answer: string;
}

const EMPTY_PROFILE = {
  personalInfo: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: '',
    location: '',
    linkedIn: '',
    willingToRelocate: '',
    resume: null as ResumeFile | null,
  },
  /**
   * Answers for requisition-specific questions, matched exactly against the
   * question text rendered on the form.
   */
  customQuestions: [] as CustomQuestion[],
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

/**
 * Runtime check for a stored `resume` value. Older profiles saved `resume`
 * as an empty string, so adapters and the options page must not assume the
 * new object shape before touching it.
 */
export function isResumeFile(value: unknown): value is ResumeFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as ResumeFile;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.base64 === 'string'
  );
}

/**
 * Profile fields the user is *allowed* to leave empty. Everything else in
 * `personalInfo` is REQUIRED for autofill.
 *
 * A required field added to {@link EMPTY_PROFILE} automatically becomes
 * "missing" for any already-saved profile — that is what lets the UI force
 * the user to update their stored profile after a schema change, without
 * formal versioning yet. Only add a field here when we intentionally allow
 * it to stay blank.
 */
const OPTIONAL_PERSONAL_INFO_FIELDS = new Set<keyof PersonalInfo>([
  'linkedIn',
  'willingToRelocate',
]);

/**
 * The `personalInfo` fields missing from the given profile, in declaration
 * order (empty array = complete). A field counts as missing when its stored
 * value is empty/`null`/absent (or an empty array), or when it's a `resume`
 * that isn't a well-formed {@link ResumeFile} — older profiles saved a
 * plain string there.
 */
export function getMissingProfileFields(
  profile: JobApplicationProfile,
): Array<keyof PersonalInfo> {
  const missing: Array<keyof PersonalInfo> = [];
  const personalInfo = profile.personalInfo as Partial<PersonalInfo> | undefined;

  for (const field of Object.keys(
    EMPTY_PROFILE.personalInfo,
  ) as Array<keyof PersonalInfo>) {
    if (OPTIONAL_PERSONAL_INFO_FIELDS.has(field)) continue;

    const value = personalInfo?.[field];
    const isEmpty =
      value === '' ||
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0);
    const isInvalidResume =
      field === 'resume' &&
      value !== null &&
      value !== undefined &&
      !isResumeFile(value);

    if (isEmpty || isInvalidResume) missing.push(field);
  }

  return missing;
}

/** True when every required {@link PersonalInfo} field is filled in. */
export function isProfileComplete(profile: JobApplicationProfile): boolean {
  return getMissingProfileFields(profile).length === 0;
}
