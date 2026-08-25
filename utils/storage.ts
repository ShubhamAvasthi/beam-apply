import { storage } from 'wxt/utils/storage';
import {
  createEmptyProfile,
  type JobApplicationProfile,
} from '~/types/profile';
import { DEV_TEST_PROFILE } from '~/utils/dev-profile';

/**
 * Fallback used when nothing is stored yet.
 *
 * In dev this is the demo fixture, so the extension starts out filled —
 * no manual entry needed to test autofill. In production `import.meta.env.DEV`
 * is statically replaced with `false` at build time, so the empty profile
 * is used and the fixture is tree-shaken out of the bundle.
 */
function fallbackProfile(): JobApplicationProfile {
  return import.meta.env.DEV
    ? structuredClone(DEV_TEST_PROFILE)
    : createEmptyProfile();
}

/**
 * The user's job application profile.
 *
 * - Reads fall back to {@link fallbackProfile} until the user saves data,
 *   so consumers always receive a complete, valid structure (never `null`).
 *
 * TODO(schema versioning): once `schemaVersion` returns to the model (see
 * types/profile.ts), pass it here as `version` and register `migrations`.
 */
export const profileStorage = storage.defineItem<JobApplicationProfile>(
  'local:profile',
  { fallback: fallbackProfile() },
);