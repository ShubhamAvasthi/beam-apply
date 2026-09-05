import {
  type CustomQuestion,
  isResumeFile,
  type JobApplicationProfile,
  type ResumeFile,
} from '~/types/profile';
import type { PlatformAdapter } from './types';

/**
 * Fields we can fill on Greenhouse, keyed by profile field — one selector
 * each.
 */
const LOCATORS = {
  firstName: '#first_name',
  lastName: '#last_name',
  email: '#email',
  phone: '#phone',
  country: '#country',
  location: '#candidate-location',
  resume: '#resume',
} as const;

const LOG_PREFIX = '[BeamApply/greenhouse]';

/**
 * Writes through the prototype's own `value` setter rather than the
 * instance property. Frameworks such as React patch that instance
 * property with a value tracker, so a plain `input.value = …` either
 * never reaches their state or is silently reverted on the next render
 * (which is exactly what we saw on Greenhouse). Setting via the
 * prototype descriptor plus bubbling `input`/`change` reads as a
 * genuine user edit. Supports inputs, textareas, and select dropdowns.
 */
function setFieldValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
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
  selector: string,
): HTMLInputElement | HTMLSelectElement | null {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  );
  return el && el.value.trim() === '' ? el : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * For autocomplete typeahead fields (Greenhouse's location AND country),
 * writing the value in a single shot (paste-style) opens the dropdown of
 * suggestions (e.g. "Bengaluru, Karnataka, India" or "United States"),
 * which is then clicked. The prototype setter + a single `input` event is
 * enough to arm Greenhouse's typeahead.
 *
 * Resolves once the option is clicked (or retries are exhausted) and returns
 * whether an option was actually clicked. With `exactOnly`, no prefix or
 * fallback option is clicked — the typed text must match a rendered option
 * exactly (custom-question answers must never guess an option).
 *
 * Filling autocomplete fields sequentially matters: each field's dropdown
 * closes the moment another input takes focus, so a later field must wait
 * its turn.
 */
async function fillAutocomplete(
  input: HTMLInputElement,
  targetText: string,
  exactOnly = false,
): Promise<boolean> {
  input.focus();

  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

  // Single-shot write of the full value, paste-style. The prototype setter
  // is used so framework value-trackers treat it as a genuine user edit.
  descriptor?.set?.call(input, targetText);
  input.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertFromPaste',
      data: targetText,
    }),
  );
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: targetText[targetText.length - 1] ?? '',
      bubbles: true,
    }),
  );
  input.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: targetText[targetText.length - 1] ?? '',
      bubbles: true,
    }),
  );

  // Let the typeahead debounce + API fetch render the suggestions.
  await wait(1000);
  const clicked = await selectDropdownOption(targetText, exactOnly);
  if (!clicked) {
    console.warn(`${LOG_PREFIX} no dropdown option found for "${targetText}" after retries.`);
  }
  return clicked;
}

/**
 * Scans for a visible dropdown option for the typed value, preferring an
 * exact text match, then a prefix match, then the first visible option.
 */
function locateDropdownOption(
  targetText: string,
  exactOnly = false,
): HTMLElement | null {
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

  // Exact answers never fall back to prefix/first-visible options.
  if (exactOnly) return exactOpt;
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
async function selectDropdownOption(
  targetText: string,
  exactOnly = false,
): Promise<boolean> {
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const option = locateDropdownOption(targetText, exactOnly);
    if (option) {
      clickDropdownOption(option);
      return true;
    }
    await wait(400);
  }
  return false;
}

/**
 * Custom (requisition-specific) questions — "Do you now or will you in the
 * future require immigration sponsorship…", "How did you hear about this
 * job?" — can't be located by fixed ids: every requisition invents its own
 * questions. Instead, the stored question only has to appear somewhere
 * within the question text the form renders — one entry like
 * "immigration sponsorship" then covers every company's phrasing — and the
 * first rendered question containing it is filled, with the answer as free
 * text or, for dropdown questions, by selecting the option whose label
 * matches exactly.
 */

/**
 * One custom question as rendered on the current form:
 * - `text` — free-text input / textarea; the answer is filled verbatim.
 * - `combobox` — react-select control (modern boards), driven like the
 *   country/location typeaheads but restricted to exact option matches.
 * - `select` — native dropdown (classic boards).
 */
type PageQuestion =
  | { kind: 'text'; control: HTMLInputElement | HTMLTextAreaElement }
  | { kind: 'combobox'; control: HTMLInputElement }
  | { kind: 'select'; control: HTMLSelectElement };

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number']);

/** A rendered page question paired with the raw text it was found by. */
type IndexedQuestion = { text: string; question: PageQuestion };

/**
 * Indexes the page's custom questions together with the question text each
 * was found by, via `label[for]` (falling back to the control's own
 * `aria-label`, which carries the same question text on live forms). The
 * text is kept exactly as rendered — matching is a plain substring test
 * against it. Radio and checkbox questions are deliberately not indexed —
 * see {@link PageQuestion}.
 */
function collectPageQuestions(): IndexedQuestion[] {
  const questions: IndexedQuestion[] = [];

  for (const label of document.querySelectorAll<HTMLLabelElement>('label[for]')) {
    const control = document.getElementById(label.htmlFor);
    if (!control) continue;

    const text = label.textContent || control.getAttribute('aria-label') || '';

    if (control instanceof HTMLInputElement) {
      if (control.getAttribute('role') === 'combobox') {
        questions.push({ text, question: { kind: 'combobox', control } });
      } else if (TEXT_INPUT_TYPES.has(control.type)) {
        questions.push({ text, question: { kind: 'text', control } });
      }
    } else if (control instanceof HTMLSelectElement) {
      questions.push({ text, question: { kind: 'select', control } });
    } else if (control instanceof HTMLTextAreaElement) {
      questions.push({ text, question: { kind: 'text', control } });
    }
  }

  return questions;
}

/**
 * Fills every stored custom question whose text appears within a rendered
 * question on the form (first match wins — keep stored questions
 * distinctive). Never overwrites: answered questions and already-selected
 * dropdowns are skipped, and a stored answer with no matching option is
 * reported, not guessed.
 */
async function fillCustomQuestions(
  entries: readonly CustomQuestion[],
): Promise<number> {
  if (entries.length === 0) return 0;

  const pageQuestions = collectPageQuestions();
  let filledCount = 0;

  for (const entry of entries) {
    const question = entry.question.trim();
    const answer = entry.answer.trim();
    if (question === '' || answer === '') continue;

    const match = pageQuestions.find(({ text }) => text.includes(question));
    if (!match) {
      console.info(
        `${LOG_PREFIX} no question on this form contains "${question}".`,
      );
      continue;
    }
    const pageQuestion = match.question;

    switch (pageQuestion.kind) {
      case 'text': {
        if (pageQuestion.control.value.trim() !== '') break; // never overwrite
        setFieldValue(pageQuestion.control, answer);
        filledCount += 1;
        break;
      }

      case 'select': {
        if (pageQuestion.control.value !== '') break;
        const option = [...pageQuestion.control.options].find(
          (candidate) =>
            candidate.value === answer ||
            (candidate.textContent ?? '').trim() === answer,
        );
        if (option) {
          setFieldValue(pageQuestion.control, option.value);
          filledCount += 1;
        } else {
          console.warn(
            `${LOG_PREFIX} question matched but no option "${answer}" exists.`,
          );
        }
        break;
      }

      case 'combobox': {
        const control = pageQuestion.control;
        // react-select renders the chosen option inside the control shell —
        // a present `.select__single-value` means this question is answered.
        const shell = control.closest('.select__control');
        if (
          control.value.trim() !== '' ||
          shell?.querySelector('.select__single-value')
        ) {
          break;
        }
        // Exact matches only — a partial answer must never pick an option.
        if (await fillAutocomplete(control, answer, true)) filledCount += 1;
        break;
      }
    }
  }

  return filledCount;
}

/**
 * Fills a dedicated LinkedIn field. On Greenhouse this is a
 * requisition-specific question (no fixed selector), so it's located by
 * case-insensitive contains against the rendered question text — the same
 * technique as custom questions, but surfaced as a first-class optional field
 * because a LinkedIn URL appears on nearly every application. Never overwrites
 * a value the applicant already typed.
 */
async function fillLinkedInField(profile: JobApplicationProfile): Promise<number> {
  const linkedIn = (profile.personalInfo.linkedIn ?? '').trim();
  if (!linkedIn) return 0;

  const match = collectPageQuestions().find(({ text }) =>
    text.toLowerCase().includes('linkedin profile'),
  );
  if (!match) return 0;

  if (match.question.kind === 'text' && match.question.control.value.trim() === '') {
    setFieldValue(match.question.control, linkedIn);
    return 1;
  }
  return 0;
}

/**
 * Fills a dedicated "willing to relocate" field. On Greenhouse this is a
 * react-select combobox (no fixed selector), located by case-insensitive
 * contains against the rendered question text. The stored answer must be the
 * exact option label the requisition renders (comboboxes only accept values
 * from their dropdown). Never overwrites an already-selected value.
 */
async function fillWillingToRelocateField(
  profile: JobApplicationProfile,
): Promise<number> {
  const answer = (profile.personalInfo.willingToRelocate ?? '').trim();
  if (!answer) return 0;

  const match = collectPageQuestions().find(({ text }) =>
    text.toLowerCase().includes('willing to relocate'),
  );
  if (!match || match.question.kind !== 'combobox') return 0;

  const control = match.question.control;
  const shell = control.closest('.select__control');
  if (
    control.value.trim() !== '' ||
    shell?.querySelector('.select__single-value')
  ) {
    return 0;
  }

  // Reuse the proven combobox path: type the answer, react-select filters to
  // the matching option, and the exact-only matcher clicks it.
  return (await fillAutocomplete(control, answer, true)) ? 1 : 0;
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

  const targets: Array<{ selector: string; value: string }> = [
    { selector: LOCATORS.firstName, value: profile.personalInfo.firstName },
    { selector: LOCATORS.lastName, value: profile.personalInfo.lastName },
    { selector: LOCATORS.email, value: profile.personalInfo.email },
    { selector: LOCATORS.phone, value: profile.personalInfo.phone },
    { selector: LOCATORS.country, value: profile.personalInfo.country },
    { selector: LOCATORS.location, value: profile.personalInfo.location },
  ];

  for (const { selector, value } of targets) {
    if (value === '') continue; // nothing in the profile for this field

    const el = locateEmptyField(selector);
    if (el) {
      if (
        (selector === LOCATORS.country || selector === LOCATORS.location) &&
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
    const input = document.querySelector<HTMLInputElement>(LOCATORS.resume);
    if (input?.type === 'file') {
      if (attachResume(input, resume)) filled.push(input);
    }
  }

  return filled;
}

export const greenhouseAdapter: PlatformAdapter = {
  id: 'greenhouse',
  hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],

  /** Runs on button click — every init race on the page is over by then. */
  async autofill(profile) {
    const filledElements = await fillNow(profile);
    const customCount = await fillCustomQuestions(
      profile.customQuestions ?? [], // profiles saved before custom questions
    );
    const linkedInCount = await fillLinkedInField(profile);
    const willingToRelocateCount = await fillWillingToRelocateField(profile);
    const filledCount =
      filledElements.length + customCount + linkedInCount + willingToRelocateCount;
    if (filledCount === 0) {
      console.info(`${LOG_PREFIX} nothing to fill.`);
    } else {
      console.info(
        `${LOG_PREFIX} filled ${filledCount} field(s)` +
          (customCount > 0 ? ` (including ${customCount} custom question(s))` : '') +
          '.',
      );
    }
    return filledCount;
  },
};
