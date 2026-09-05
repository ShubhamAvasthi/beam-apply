import type { JobApplicationProfile } from '~/types/profile';

/**
 * Demo profile used as the storage fallback during development, so the
 * autofill button can be tested against realistic data without manually
 * saving via the options page first.
 *
 * Referenced only behind `import.meta.env.DEV` in utils/storage.ts, which
 * Vite replaces at build time — so this fixture never ships in production.
 */
export const DEV_TEST_PROFILE: JobApplicationProfile = {
  personalInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1 (555) 019-2834',
    country: 'United States',
    location: 'San Francisco, CA',
    linkedIn: 'https://www.linkedin.com/in/johndoe',
    resume: {
      name: 'John_Doe_Resume.pdf',
      mimeType: 'application/pdf',
      size: 6,
      base64: 'cmVzdW1l', // "resume" — stand-in bytes, dev fixture only
    },
  },
  customQuestions: [
    {
      question: 'immigration sponsorship',
      answer: 'No',
    },
  ],
  updatedAt: null,
};
