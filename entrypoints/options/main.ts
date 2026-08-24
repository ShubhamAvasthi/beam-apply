import './style.css';

import type { JobApplicationProfile } from '@/types/profile';
import { createEmptyProfile, profileStorage } from '@/utils/storage';
import {
  createInput,
  createLabeledField,
  createSection,
  type SectionHandle,
} from '@/components/form-kit';

/** Editable copy of the profile; written to storage only on save. */
let draft: JobApplicationProfile = createEmptyProfile();
let dirty = false;
let saving = false;
let statusTimer: ReturnType<typeof setTimeout> | undefined;

let saveButton!: HTMLButtonElement;
let statusEl!: HTMLSpanElement;
let savedAtEl!: HTMLParagraphElement;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function markDirty(): void {
  dirty = true;
  refreshControls();
}

function flash(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('err', isError);
  statusEl.classList.toggle('ok', !isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.classList.remove('ok', 'err');
  }, 2600);
}

function refreshControls(): void {
  saveButton.textContent = saving ? 'Saving…' : dirty ? 'Save changes' : 'All saved';
  saveButton.disabled = saving;
}

function updateSavedAt(): void {
  savedAtEl.textContent = draft.updatedAt
    ? `Last saved ${dateFormatter.format(new Date(draft.updatedAt))}`
    : 'Not saved yet';
}

async function save(): Promise<void> {
  if (saving) return;
  if (
    draft.personalInfo.firstName.trim() === '' ||
    draft.personalInfo.lastName.trim() === ''
  ) {
    flash('First and last name are required.', true);
    return;
  }
  saving = true;
  refreshControls();
  try {
    draft.updatedAt = new Date().toISOString();
    await profileStorage.setValue(draft);
    dirty = false;
    updateSavedAt();
    flash('Saved ✓');
  } catch (error) {
    console.error('BeamApply: failed to save profile', error);
    flash('Save failed — see console', true);
  } finally {
    saving = false;
    refreshControls();
  }
}

function buildPersonalSection(): SectionHandle {
  const section = createSection(
    'Personal information',
    'Core details used to autofill application forms.',
  );
  const personal = draft.personalInfo;

  const firstName = createInput({ required: true, autoComplete: 'given-name' });
  firstName.value = personal.firstName;
  firstName.addEventListener('input', () => {
    personal.firstName = firstName.value;
    markDirty();
  });

  const lastName = createInput({ required: true, autoComplete: 'family-name' });
  lastName.value = personal.lastName;
  lastName.addEventListener('input', () => {
    personal.lastName = lastName.value;
    markDirty();
  });

  const grid = document.createElement('div');
  grid.className = 'grid cols-2';
  grid.append(
    createLabeledField('First name *', firstName),
    createLabeledField('Last name *', lastName),
  );

  section.body.append(grid);
  return section;
}

function renderApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;

  statusEl = document.createElement('span');
  statusEl.className = 'status';
  statusEl.setAttribute('role', 'status');

  savedAtEl = document.createElement('p');
  savedAtEl.className = 'saved-at';

  saveButton = document.createElement('button');
  saveButton.id = 'save';
  saveButton.type = 'button';
  saveButton.addEventListener('click', () => {
    void save();
  });

  const headings = document.createElement('div');
  headings.className = 'headings';
  const h1 = document.createElement('h1');
  h1.textContent = 'BeamApply Profile';
  const tagline = document.createElement('p');
  tagline.className = 'tagline';
  tagline.textContent = 'Your autofill profile — kept on this device only';
  headings.append(h1, tagline);

  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.append(statusEl, savedAtEl, saveButton);

  const headerRow = document.createElement('div');
  headerRow.className = 'header-row';
  headerRow.append(headings, controls);

  const header = document.createElement('header');
  header.className = 'app-header';
  header.append(headerRow);

  const main = document.createElement('main');
  main.append(buildPersonalSection().root);

  const footer = document.createElement('footer');
  footer.className = 'privacy';
  footer.textContent =
    'BeamApply stores your profile in this browser’s local storage. Nothing leaves your device.';

  app.replaceChildren(header, main, footer);

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  updateSavedAt();
  refreshControls();
}

// Entry point: load the stored profile, then paint the editor.
draft = await profileStorage.getValue();
renderApp();