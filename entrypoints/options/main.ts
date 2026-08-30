import '@picocss/pico/css/pico.min.css';

import {
  isResumeFile,
  type JobApplicationProfile,
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
const resumeInput = document.querySelector<HTMLInputElement>('#resume')!;
const resumeName = document.querySelector<HTMLElement>('#resume-name')!;
const resumeRemove = document.querySelector<HTMLButtonElement>('#resume-remove')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const savedAt = document.querySelector<HTMLElement>('#saved-at')!;

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
 */
const byteFormatter = new Intl.NumberFormat(undefined, {
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

    const profile: JobApplicationProfile = {
      personalInfo: {
        firstName: firstName.value,
        lastName: lastName.value,
        email: email.value,
        phone: phone.value,
        country: country.value,
        location: locationInput.value,
        resume: selectedResume,
      },
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
