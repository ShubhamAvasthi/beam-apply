import {
  isResumeFile,
  type JobApplicationProfile,
  type ResumeFile,
} from '~/types/profile';
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
  resume: [
    'input[type="file"][name*="resume" i]',
    'input[type="file"][id*="resume" i]',
    '#resume',
    'input[name*="resume" i]',
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * For autocomplete typeahead fields (Greenhouse's location AND country),
 * typing the value opens a dropdown of suggestions (e.g. "Bengaluru,
 * Karnataka, India" or "United States"). This simulates real human typing
 * character-by-character so typeahead debouncers and API fetch listeners
 * trigger correctly, then clicks the resulting visible dropdown option.
 *
 * Resolves once the option is clicked (or retries are exhausted). Filling
 * autocomplete fields sequentially matters: each field's dropdown closes the
 * moment another input takes focus, so a later field must wait its turn.
 */
async function fillAutocomplete(
  input: HTMLInputElement,
  targetText: string,
): Promise<void> {
  input.focus();

  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(input, '');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

  // Track what we intend to type ourselves. Comboboxes like Greenhouse's
  // country field may clear the input when the first keystroke opens the
  // dropdown, so reading `input.value` back to append the next char would
  // silently drop characters (a failed "India" → "ndia"). Re-asserting the
  // full typed prefix on every tick keeps the field in sync regardless of
  // transient widget resets.
  let typed = '';
  for (let charIndex = 0; charIndex < targetText.length; charIndex += 1) {
    const char = targetText[charIndex];
    typed += char;
    descriptor?.set?.call(input, typed);

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
    // No artificial delay between characters: these are scripted events fired
    // synchronously in a single task, so pacing them would only stagger the
    // keystrokes without giving the browser time to render in between. The
    // typeahead's debounce coalesces the burst into one lookup with the full
    // value; the wait below lets that lookup complete before scanning options.
  }

  // Let the typeahead debounce + API fetch render the suggestions.
  await wait(1000);
  const clicked = await selectDropdownOption(targetText);
  if (!clicked) {
    console.warn(`${LOG_PREFIX} no dropdown option found for "${targetText}" after retries.`);
  }
}

/**
 * Scans for a visible dropdown option for the typed value, preferring an
 * exact text match, then a prefix match, then the first visible option.
 */
function locateDropdownOption(targetText: string): HTMLElement | null {
  // `li.iti__country` is Greenhouse's intl-tel-input country picker (the
  // dropdown item is e.g. `<li class="iti__country" data-country-code="in">
  // <span class="iti__country-name">India</span> …
  // <span class="iti__dial-code">+91</span></li>`).
  const selector =
    '.iti__country, ul.ui-autocomplete li, .select2-results__option, .auto-complete-results li, [role="option"], .pac-item, li[id*="result"], div[class*="suggestion"], div[class*="option"], li[class*="suggestion"], .tt-suggestion, .option';
  const potentialOptions = document.querySelectorAll<HTMLElement>(selector);

  let fallbackOpt: HTMLElement | null = null;
  let prefixOpt: HTMLElement | null = null;
  let exactOpt: HTMLElement | null = null;

  const needle = targetText.trim().toLowerCase();

  for (const opt of potentialOptions) {
    const computed = window.getComputedStyle(opt);
    const rect = opt.getBoundingClientRect();
    const isVisible =
      computed.display !== 'none' &&
      computed.visibility !== 'hidden' &&
      computed.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0;

    if (!isVisible) continue;

    if (!fallbackOpt) fallbackOpt = opt;
    if (!needle) continue;

    // intl-tel-input items contain the country name AND the dial code
    // ("India+91"). Match against the visible country-name span so "india"
    // is an exact match instead of being polluted by "+91".
    const nameEl = opt.classList.contains('iti__country')
      ? opt.querySelector<HTMLElement>('.iti__country-name')
      : null;
    const text = (nameEl?.textContent ?? opt.textContent ?? '').trim().toLowerCase();

    // Prefer the option that exactly matches what we typed, then one that
    // starts with it, before the first visible suggestion.
    if (text === needle && !exactOpt) {
      exactOpt = opt;
    } else if (text.startsWith(needle) && !prefixOpt) {
      prefixOpt = opt;
    }
  }

  return exactOpt ?? prefixOpt ?? fallbackOpt;
}

/** Simulates a genuine glyph-level mouse gesture on the dropdown option. */
function clickDropdownOption(option: HTMLElement): void {
  const rect = option.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const fireMouse = (el: Element, type: string): void => {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      }),
    );
  };

  // Widgets like intl-tel-input select on `mousedown` (before the input
  // blur beats the click), so dispatch the full gesture at the item's
  // real coordinates.
  const topmostEl = document.elementFromPoint(x, y) || option;
  fireMouse(topmostEl, 'mousedown');
  fireMouse(topmostEl, 'mouseup');
  fireMouse(topmostEl, 'click');

  // intl-tel-input binds selection on the <li>, so when the topmost element
  // is a child (flag/name span) that swallowed the gesture, also click the
  // <li> directly. Plain autocompletes select via the bubbling gesture
  // alone — keep this safety net iti-only.
  if (topmostEl !== option && option.classList.contains('iti__country')) {
    fireMouse(option, 'click');
  }
}

/** Polls the dropdown for up to ~1.6s and clicks the matching option. */
async function selectDropdownOption(targetText: string): Promise<boolean> {
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const option = locateDropdownOption(targetText);
    if (option) {
      clickDropdownOption(option);
      return true;
    }
    await wait(400);
  }
  return false;
}

/**
 * Attaches the stored resume to a file input.
 *
 * Browsers block assigning a path to `input.value`, and `input.files` can
 * only accept a `FileList` produced from user interaction or a
 * `DataTransfer`. We rebuild the original `File` from the stored base64 and
 * feed it through a `DataTransfer` — the same technique file-attaching
 * extensions use — then dispatch `input`/`change` so framework listeners
 * (e.g. React) see the upload.
 */
function attachResume(input: HTMLInputElement, resume: ResumeFile): boolean {
  if (input.files && input.files.length > 0) {
    console.info(`${LOG_PREFIX} resume already attached — leaving it untouched.`);
    return false;
  }

  const binary = atob(resume.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const file = new File([bytes], resume.name, { type: resume.mimeType });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  console.info(
    `${LOG_PREFIX} attached resume "${resume.name}" (${resume.size} bytes).`,
  );
  return true;
}

/** Fills whatever supported fields exist right now; returns the elements written. */
async function fillNow(
  profile: JobApplicationProfile,
): Promise<Array<HTMLInputElement | HTMLSelectElement>> {
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
      if (
        (selectors === LOCATORS.country || selectors === LOCATORS.location) &&
        el instanceof HTMLInputElement
      ) {
        // Await completion — focusing the next field would blur and close
        // this field's dropdown before its option gets clicked.
        await fillAutocomplete(el, value);
      } else {
        setFieldValue(el, value);
      }
      filled.push(el);
    }
  }

  // Resume is a file, not a text value — attach it to the upload input.
  const resume = profile.personalInfo.resume;
  if (isResumeFile(resume)) {
    for (const selector of LOCATORS.resume) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (!input || input.type !== 'file') continue;
      if (attachResume(input, resume)) filled.push(input);
      break;
    }
  }

  return filled;
}

export const greenhouseAdapter: PlatformAdapter = {
  id: 'greenhouse',
  hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],

  /** Runs on button click — every init race on the page is over by then. */
  async autofill(profile) {
    const filledCount = (await fillNow(profile)).length;
    if (filledCount === 0) {
      console.info(`${LOG_PREFIX} nothing to fill.`);
    } else {
      console.info(`${LOG_PREFIX} filled ${filledCount} field(s).`);
    }
    return filledCount;
  },
};
