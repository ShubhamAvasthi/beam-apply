import type { JobApplicationProfile } from '~/types/profile';
import type { PlatformAdapter } from './types';

/**
 * Fields we can fill on Greenhouse, keyed by profile field. Each entry
 * lists locators tried in order — first hit wins — with attribute
 * fallbacks in case the ids ever change.
 */
const LOCATORS = {
  firstName: ['#first_name', 'input[name="first_name"]'],
  lastName: ['#last_name', 'input[name="last_name"]'],
  email: ['#email', 'input[name="email"]'],
  phone: ['#phone', 'input[name="phone"]', 'input[name*="phone"]'],
  country: [
    '#country',
    'select[name="country"]',
    'select[name*="country"]',
    'select[aria-label*="Country"]',
  ],
  location: [
    '#location',
    'input[name="location"]',
    'input[name="job_application[location]"]',
    'input[name*="location"]',
    'input[id*="location"]',
  ],
} as const;

const LOG_PREFIX = '[BeamApply/greenhouse]';

/**
 * Writes through the prototype's own `value` setter rather than the
 * instance property. Frameworks such as React patch that instance
 * property with a value tracker, so a plain `input.value = …` either
 * never reaches their state or is silently reverted on the next render
 * (which is exactly what we saw on Greenhouse). Setting via the
 * prototype descriptor plus bubbling `input`/`change` reads as a
 * genuine user edit. Supports both inputs and select dropdowns.
 */
function setFieldValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
): void {
  const proto =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * First matching locator whose field exists AND is still empty — values
 * the applicant already typed are never overwritten.
 */
function locateEmptyField(
  selectors: readonly string[],
): HTMLInputElement | HTMLSelectElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      selector,
    );
    if (el && el.value.trim() === '') return el;
  }
  return null;
}

/**
 * For autocomplete fields like Greenhouse's location, typing the city
 * opens a dropdown of suggestions (e.g. "Bengaluru, Karnataka, India").
 * This simulates real human typing character-by-character so typeahead
 * debouncers and API fetch listeners trigger correctly, then clicks
 * the resulting visible dropdown option.
 */
function fillLocationWithAutocomplete(
  input: HTMLInputElement,
  targetLocation: string,
): void {
  input.focus();

  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(input, '');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

  let charIndex = 0;

  const typeNextChar = () => {
    if (charIndex < targetLocation.length) {
      const char = targetLocation[charIndex];
      const currentVal = input.value + char;
      descriptor?.set?.call(input, currentVal);

      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      });
      input.dispatchEvent(inputEvent);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      charIndex++;
      setTimeout(typeNextChar, 60); // 60ms between characters
    } else {
      setTimeout(() => findAndClickDropdownOption(0), 1000);
    }
  };

  typeNextChar();
}

function findAndClickDropdownOption(attempts = 0) {
  const selector =
    'ul.ui-autocomplete li, .select2-results__option, .auto-complete-results li, [role="option"], .pac-item, li[id*="result"], div[class*="suggestion"], div[class*="option"], li[class*="suggestion"], .tt-suggestion, .option';
  const potentialOptions = document.querySelectorAll<HTMLElement>(selector);

  let targetOpt: HTMLElement | null = null;

  for (const opt of potentialOptions) {
    const computed = window.getComputedStyle(opt);
    const rect = opt.getBoundingClientRect();
    const isVisible =
      computed.display !== 'none' &&
      computed.visibility !== 'hidden' &&
      computed.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0;

    if (isVisible) {
      targetOpt = opt;
      break;
    }
  }

  if (targetOpt) {
    const rect = targetOpt.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topmostEl = document.elementFromPoint(x, y) || targetOpt;

    topmostEl.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }),
    );
    topmostEl.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }),
    );
    topmostEl.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }),
    );
  } else if (attempts < 4) {
    setTimeout(() => findAndClickDropdownOption(attempts + 1), 400);
  }
}

/** Fills whatever supported fields exist right now; returns the elements written. */
function fillNow(
  profile: JobApplicationProfile,
): Array<HTMLInputElement | HTMLSelectElement> {
  const filled: Array<HTMLInputElement | HTMLSelectElement> = [];

  const targets: Array<{ selectors: readonly string[]; value: string }> = [
    { selectors: LOCATORS.firstName, value: profile.personalInfo.firstName },
    { selectors: LOCATORS.lastName, value: profile.personalInfo.lastName },
    { selectors: LOCATORS.email, value: profile.personalInfo.email },
    { selectors: LOCATORS.phone, value: profile.personalInfo.phone },
    { selectors: LOCATORS.country, value: profile.personalInfo.country },
    { selectors: LOCATORS.location, value: profile.personalInfo.location },
  ];

  for (const { selectors, value } of targets) {
    if (value === '') continue; // nothing in the profile for this field

    const el = locateEmptyField(selectors);
    if (el) {
      if (selectors === LOCATORS.location && el instanceof HTMLInputElement) {
        fillLocationWithAutocomplete(el, value);
      } else {
        setFieldValue(el, value);
      }
      filled.push(el);
    }
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