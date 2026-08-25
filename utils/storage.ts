import { storage } from 'wxt/utils/storage';
import {
  createEmptyProfile,
  type JobApplicationProfile,
} from '~/types/profile';

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