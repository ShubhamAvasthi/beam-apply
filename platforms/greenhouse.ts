import type { JobApplicationProfile } from '~/types/profile';
import type { PlatformAdapter } from './types';

/**
 * Locators tried in order; first hit wins. These target Greenhouse's
 * standard application form (`#first_name` / `#last_name`) with attribute
 * fallbacks in case the ids ever change.
 */
const LOCATORS = {
  firstName: ['#first_name', 'input[name="first_name"]'],
  lastName: ['#last_name', 'input[name="last_name"]'],
} as const;

const LOG_PREFIX = '[BeamApply/greenhouse]';

/**
 * Writes through the prototype's own `value` setter rather than the
 * instance property. Frameworks such as React patch that instance
 * property with a value tracker, so a plain `input.value = …` either
 * never reaches their state or is silently reverted on the next render
 * (which is exactly what we saw on Greenhouse). Setting via the
 * prototype descriptor plus bubbling `input`/`change` reads as a
 * genuine user edit.
 */
function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * First matching locator whose field exists AND is still empty — values
 * the applicant already typed are never overwritten.
 */
function locateEmptyField(
  selectors: readonly string[],
): HTMLInputElement | null {
  for (const selector of selectors) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input && input.value.trim() === '') return input;
  }
  return null;
}

/** Fills whatever name fields exist right now; returns them. */
function fillNow(profile: JobApplicationProfile): HTMLInputElement[] {
  const filled: HTMLInputElement[] = [];

  const firstNameInput = locateEmptyField(LOCATORS.firstName);
  if (firstNameInput && profile.personalInfo.firstName !== '') {
    setInputValue(firstNameInput, profile.personalInfo.firstName);
    filled.push(firstNameInput);
  }

  const lastNameInput = locateEmptyField(LOCATORS.lastName);
  if (lastNameInput && profile.personalInfo.lastName !== '') {
    setInputValue(lastNameInput, profile.personalInfo.lastName);
    filled.push(lastNameInput);
  }

  return filled;
}

export const greenhouseAdapter: PlatformAdapter = {
  id: 'greenhouse',
  hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],

  /** Runs on button click — every init race on the page is over by then. */
  autofill(profile) {
    const filledCount = fillNow(profile).length;
    if (filledCount === 0) {
      console.info(`${LOG_PREFIX} nothing to fill.`);
    } else {
      console.info(`${LOG_PREFIX} filled ${filledCount} field(s).`);
    }
    return filledCount;
  },
};