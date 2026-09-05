import '@picocss/pico/css/pico.min.css';

import {
  type CustomQuestion,
  getMissingProfileFields,
  isResumeFile,
  type JobApplicationProfile,
  type PersonalInfo,
  type ResumeFile,
} from '@/types/profile';
import { profileStorage } from '@/utils/storage';

const form = document.querySelector<HTMLFormElement>('#profile-form')!;
const firstName = document.querySelector<HTMLInputElement>('#first-name')!;
const lastName = document.querySelector<HTMLInputElement>('#last-name')!;
const email = document.querySelector<HTMLInputElement>('#email')!;
const phone = document.querySelector<HTMLInputElement>('#phone')!;
const country = document.querySelector<HTMLSelectElement>('#country')!;
const locationInput = document.querySelector<HTMLInputElement>('#location')!;
const linkedinInput = document.querySelector<HTMLInputElement>('#linkedin')!;
const willingToRelocateInput = document.querySelector<HTMLSelectElement>('#willing-to-relocate')!;
const resumeInput = document.querySelector<HTMLInputElement>('#resume')!;
const resumeName = document.querySelector<HTMLElement>('#resume-name')!;
const resumeRemove = document.querySelector<HTMLButtonElement>('#resume-remove')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const savedAt = document.querySelector<HTMLElement>('#saved-at')!;
const customQuestions = document.querySelector<HTMLDivElement>('#custom-questions')!;
const addQuestionButton = document.querySelector<HTMLButtonElement>('#add-question')!;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

let statusTimer: ReturnType<typeof setTimeout> | undefined;

/** Resume currently staged in the form (in memory until "Save changes"). */
let selectedResume: ResumeFile | null = null;

/** Keep stored profiles inside browser.storage quotas — base64 inflates ~33%. */
const MAX_RESUME_BYTES = 5 * 1000 * 1000; // decimal 5 MB, matching the Intl.NumberFormat display scale

/**
 * Native byte formatting: `notation: 'compact'` handles the KB/MB scale
 * tiers and `unitDisplay: 'narrow'` yields terse units ("1.5KB", "1MB").
 * Decimal (1000) scale — perfectly fine for an informational size label.
 *
 * The locale is pinned to `en-US`. With `undefined`, locales using the
 * Indian number system (e.g. `en-IN`) compact-scale by lakh/crore with the
 * symbols "L"/"Cr", producing labels like "1.4LB" that read as "1.4 lb"
 * (pounds); most other locales emit long forms ("1,4 Mio. B", "1.4MlnB").
 * Byte sizes are universally read with K/M/G suffixes, so a fixed locale
 * keeps the output clean and deterministic for every user.
 */
const byteFormatter = new Intl.NumberFormat('en-US', {
  style: 'unit',
  unit: 'byte',
  notation: 'compact',
  unitDisplay: 'narrow',
});

function formatBytes(bytes: number): string {
  return byteFormatter.format(bytes);
}

/** Reads a picked file into a {@link ResumeFile} (base64 content included). */
function readResumeFile(file: File): Promise<ResumeFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

function renderResume(): void {
  if (selectedResume) {
    resumeName.textContent = `${selectedResume.name} (${formatBytes(selectedResume.size)})`;
    resumeRemove.hidden = false;
  } else {
    resumeName.textContent = 'No resume selected — a resume is required.';
    resumeRemove.hidden = true;
  }
}

function flash(message: string, color?: string): void {
  status.textContent = message;
  status.style.color = color ?? '';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = '';
    status.style.color = '';
  }, 2600);
}

/**
 * Custom requisition questions are plain Q/A rows staged in the DOM and
 * collected at save time — the same pattern as the rest of the form.
 */
function addCustomQuestionRow(initial?: CustomQuestion): void {
  const row = document.createElement('div');
  row.className = 'custom-question-row';
  row.setAttribute('data-custom-question', '');

  const questionLabel = document.createElement('label');
  questionLabel.append('Question');
  const questionInput = document.createElement('input');
  questionInput.type = 'text';
  questionInput.className = 'custom-question-text';
  questionInput.placeholder = 'Distinctive fragment of the question text';
  if (initial) questionInput.value = initial.question;
  questionLabel.append(questionInput);

  const answerGrid = document.createElement('div');
  answerGrid.className = 'grid';
  const answerLabel = document.createElement('label');
  answerLabel.append('Answer');
  const answerInput = document.createElement('input');
  answerInput.type = 'text';
  answerInput.className = 'custom-question-answer';
  answerInput.placeholder = 'Answer text or option label to fill';
  if (initial) answerInput.value = initial.answer;
  answerLabel.append(answerInput);
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary outline';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    row.remove();
  });
  answerGrid.append(answerLabel, removeButton);

  row.append(questionLabel, answerGrid);
  customQuestions.append(row);
}

/** Collects the staged rows; a half-filled row (question OR answer) is an error. */
function readCustomQuestions(): {
  questions: CustomQuestion[];
  error: string | null;
} {
  const questions: CustomQuestion[] = [];
  for (const row of customQuestions.querySelectorAll('[data-custom-question]')) {
    const question = row.querySelector<HTMLInputElement>(
      '.custom-question-text',
    )!.value.trim();
    const answer = row.querySelector<HTMLInputElement>(
      '.custom-question-answer',
    )!.value.trim();
    if (question === '' && answer === '') continue; // untouched row
    if (question === '' || answer === '') {
      return {
        questions: [],
        error: 'Each custom question needs both a question and an answer.',
      };
    }
    questions.push({ question, answer });
  }
  return { questions, error: null };
}

addQuestionButton.addEventListener('click', () => addCustomQuestionRow());

function updateSavedAt(profile: JobApplicationProfile): void {
  savedAt.textContent = profile.updatedAt
    ? `Last saved ${dateFormatter.format(new Date(profile.updatedAt))}`
    : 'Not saved yet';
}

resumeInput.addEventListener('change', () => {
  const file = resumeInput.files?.[0];
  if (!file) return;
  void (async () => {
    if (file.size > MAX_RESUME_BYTES) {
      resumeInput.value = '';
      flash('Resume must be under 5 MB', '#f87171');
      return;
    }
    try {
      selectedResume = await readResumeFile(file);
      renderResume();
    } catch (error) {
      console.error('BeamApply: failed to read resume', error);
      flash('Failed to read resume', '#f87171');
    }
  })();
});

resumeRemove.addEventListener('click', () => {
  selectedResume = null;
  resumeInput.value = '';
  renderResume();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    if (!selectedResume) {
      flash('Please select a resume first — it is required.', '#f87171');
      return;
    }

    const custom = readCustomQuestions();
    if (custom.error) {
      flash(custom.error, '#f87171');
      return;
    }

    const profile: JobApplicationProfile = {
      personalInfo: {
        firstName: firstName.value,
        lastName: lastName.value,
        email: email.value,
        phone: phone.value,
        country: country.value,
        location: locationInput.value,
        linkedIn: linkedinInput.value,
        willingToRelocate: willingToRelocateInput.value,
        resume: selectedResume,
      },
      customQuestions: custom.questions,
      updatedAt: new Date().toISOString(),
    };
    try {
      await profileStorage.setValue(profile);
      updateSavedAt(profile);
      flash('Saved ✓', '#4ade80');
    } catch (error) {
      console.error('BeamApply: failed to save profile', error);
      flash('Save failed — see console', '#f87171');
    }
  })();
});

// Entry point: load the stored profile into the form.
const stored = await profileStorage.getValue();
firstName.value = stored.personalInfo.firstName;
lastName.value = stored.personalInfo.lastName;
email.value = stored.personalInfo.email;
phone.value = stored.personalInfo.phone;
country.value = stored.personalInfo.country;
locationInput.value = stored.personalInfo.location;
if (isResumeFile(stored.personalInfo.resume)) {
  selectedResume = stored.personalInfo.resume;
}
renderResume();
updateSavedAt(stored);
// Profiles saved before custom questions existed lack the field entirely.
for (const entry of stored.customQuestions ?? []) addCustomQuestionRow(entry);
if (stored.personalInfo.linkedIn) linkedinInput.value = stored.personalInfo.linkedIn;
if (stored.personalInfo.willingToRelocate) willingToRelocateInput.value = stored.personalInfo.willingToRelocate;

// Field boundary is the single form; resume is guided inline instead (the
// "No resume selected — a resume is required." text under the picker).
const fieldElements: Record<keyof PersonalInfo, HTMLElement | null> = {
  firstName,
  lastName,
  email,
  phone,
  country,
  location: locationInput,
  linkedIn: linkedinInput,
  willingToRelocate: willingToRelocateInput,
  resume: null,
};

// Schema guard: after a new required field is added, older stored profiles
// are missing it. Banner + highlighting guide the fix; autofill stays
// blocked (see components/autofill-button.ts) until the profile is saved.
const missing = getMissingProfileFields(stored);
if (missing.length > 0) {
  status.textContent =
    `Missing required: ${missing.join(', ')}. Fill them below and save to unlock autofill.`;
  status.style.color = '#f87171';
  clearTimeout(statusTimer);
  statusTimer = undefined;
  for (const field of missing) fieldElements[field]?.setAttribute('aria-invalid', 'true');
}

// Clear the "invalid" styling as the user fixes each field.
form.addEventListener('input', () => {
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) {
    el.removeAttribute('aria-invalid');
  }
});
