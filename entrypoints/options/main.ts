import '@picocss/pico/css/pico.min.css';

import type { JobApplicationProfile } from '@/types/profile';
import { profileStorage } from '@/utils/storage';

const form = document.querySelector<HTMLFormElement>('#profile-form')!;
const firstName = document.querySelector<HTMLInputElement>('#first-name')!;
const lastName = document.querySelector<HTMLInputElement>('#last-name')!;
const email = document.querySelector<HTMLInputElement>('#email')!;
const phone = document.querySelector<HTMLInputElement>('#phone')!;
const country = document.querySelector<HTMLSelectElement>('#country')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const savedAt = document.querySelector<HTMLElement>('#saved-at')!;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

let statusTimer: ReturnType<typeof setTimeout> | undefined;

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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const profile: JobApplicationProfile = {
      personalInfo: {
        firstName: firstName.value,
        lastName: lastName.value,
        email: email.value,
        phone: phone.value,
        country: country.value,
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
updateSavedAt(stored);
