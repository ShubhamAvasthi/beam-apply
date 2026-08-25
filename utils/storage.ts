import { storage } from 'wxt/utils/storage';
import type { JobApplicationProfile } from '~/types/profile';

/**
 * Creates a pristine, fully-structured profile with no user data.
 *
 * Returned fresh on every call so callers can safely mutate their copy
 * without affecting anything else. Contains no random values or timestamps,
 * keeping creation deterministic.
 */
function createEmptyProfile(): JobApplicationProfile {
  return {
    personalInfo: {
      firstName: '',
      lastName: '',
    },
    updatedAt: null,
  };
}

/**
 * The user's job application profile.
 *
 * - Reads fall back to {@link createEmptyProfile} until the user saves data,
 *   so consumers always receive a complete, valid structure (never `null`).
 *
 * TODO(schema versioning): once `schemaVersion` returns to the model (see
 * types/profile.ts), pass it here as `version` and register `migrations`.
 */
export const profileStorage = storage.defineItem<JobApplicationProfile>(
  'local:profile',
  { fallback: createEmptyProfile() },
);