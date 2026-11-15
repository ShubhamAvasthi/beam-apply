import type { JobApplicationProfile } from "@/types/profile";

/** Contents of the test resume; `TEST_PROFILE`'s `base64` encodes this. */
export const TEST_RESUME_TEXT = "%PDF-1.4 test resume";

/**
 * A complete profile with values that differ from the dev fixture
 * (utils/dev-profile.ts), so a test can't pass by accidentally reading the
 * storage fallback instead of the profile it was given.
 *
 * Returns a fresh copy each call — fills and edits may mutate it.
 */
export function testProfile(): JobApplicationProfile {
  return {
    personalInfo: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+44 20 7946 0000",
      country: "United Kingdom",
      location: "London, England, United Kingdom",
      linkedIn: "https://www.linkedin.com/in/ada-example",
      willingToRelocate: "I am willing to relocate to this job's location.",
      howDidYouHear: "Company website",
      resume: {
        name: "ada-lovelace-resume.pdf",
        mimeType: "application/pdf",
        size: TEST_RESUME_TEXT.length,
        base64: btoa(TEST_RESUME_TEXT),
      },
    },
    customQuestions: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
