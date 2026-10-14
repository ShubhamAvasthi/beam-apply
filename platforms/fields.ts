/**
 * Reusable field objects shared by every platform adapter.
 *
 * A platform adapter defines *which* fields its forms render — see the
 * `FIELDS` list in each adapter — by composing the classes exported here;
 * everything about *how* a value is written lives in this module, so
 * framework value trackers and JS widgets treat it as a genuine user
 * edit. The module's entire surface is classes.
 */

import {
  isResumeFile,
  type JobApplicationProfile,
  type PersonalInfo,
  type ResumeFile,
} from "~/types/profile";
import { createLogger } from "~/utils/logger";

// Shared field code logs under the generic prefix; adapters that compose
// these fields add their own namespace on top (see each adapter).
const log = createLogger();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes through the prototype's own `value` setter rather than the
 * instance property. Frameworks such as React patch that instance
 * property with a value tracker, so a plain `input.value = …` either
 * never reaches their state or is silently reverted on the next render
 * (which is exactly what we saw on live boards). Setting via the
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
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * One question rendered on the current form:
 * - `text` — free-text input / textarea; the answer is filled verbatim.
 * - `combobox` — react-select control (modern boards), driven like the
 *   typeahead fields but restricted to exact option matches.
 * - `select` — native dropdown (classic boards).
 */
type PageQuestion =
  | { kind: "text"; control: HTMLInputElement | HTMLTextAreaElement }
  | { kind: "combobox"; control: HTMLInputElement }
  | { kind: "select"; control: HTMLSelectElement };

/** A rendered page question paired with the raw text it was found by. */
type IndexedQuestion = { text: string; question: PageQuestion };

const TEXT_INPUT_TYPES = new Set(["text", "email", "tel", "url", "number"]);

/**
 * Indexes the page's questions together with the question text each was
 * found by, via `label[for]` (falling back to the control's own
 * `aria-label`, which carries the same question text on live forms). The
 * text is kept exactly as rendered — matching is a plain substring test
 * against it. Radio and checkbox questions are deliberately not indexed —
 * see {@link PageQuestion}.
 */
function collectPageQuestions(): IndexedQuestion[] {
  const questions: IndexedQuestion[] = [];

  for (const label of document.querySelectorAll<HTMLLabelElement>(
    "label[for]",
  )) {
    const control = document.getElementById(label.htmlFor);
    if (!control) continue;

    const text = label.textContent || control.getAttribute("aria-label") || "";

    if (control instanceof HTMLInputElement) {
      if (control.getAttribute("role") === "combobox") {
        questions.push({ text, question: { kind: "combobox", control } });
      } else if (TEXT_INPUT_TYPES.has(control.type)) {
        questions.push({ text, question: { kind: "text", control } });
      }
    } else if (control instanceof HTMLSelectElement) {
      questions.push({ text, question: { kind: "select", control } });
    } else if (control instanceof HTMLTextAreaElement) {
      questions.push({ text, question: { kind: "text", control } });
    }
  }

  return questions;
}

/**
 * For autocomplete typeahead fields (the location AND country pickers,
 * for example), writing the value in a single shot (paste-style) opens
 * the dropdown of suggestions (e.g. "Bengaluru, Karnataka, India" or
 * "United States"), which is then clicked. The prototype setter + a
 * single `input` event is enough to arm the typeahead.
 *
 * Resolves once the option is clicked (or retries are exhausted) and
 * returns whether an option was actually clicked. With `exactOnly`, no
 * prefix or fallback option is clicked — the typed text must match a
 * rendered option exactly (custom-question answers must never guess an
 * option).
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
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

  // Single-shot write of the full value, paste-style. The prototype setter
  // is used so framework value-trackers treat it as a genuine user edit.
  descriptor?.set?.call(input, targetText);
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      data: targetText,
    }),
  );
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: targetText[targetText.length - 1] ?? "",
      bubbles: true,
    }),
  );
  input.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: targetText[targetText.length - 1] ?? "",
      bubbles: true,
    }),
  );

  // Let the typeahead debounce + API fetch render the suggestions.
  await wait(1000);
  const clicked = await selectDropdownOption(targetText, exactOnly);
  if (!clicked) {
    log.warn(`no dropdown option found for "${targetText}" after retries.`);
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
  // `li.iti__country` is the intl-tel-input country picker used by several
  // boards (the dropdown item is e.g. `<li class="iti__country"
  // data-country-code="in"><span class="iti__country-name">India</span> …
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
      computed.display !== "none" &&
      computed.visibility !== "hidden" &&
      computed.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;

    if (!isVisible) continue;

    if (!fallbackOpt) fallbackOpt = opt;
    if (!needle) continue;

    // intl-tel-input items contain the country name AND the dial code
    // ("India+91"). Match against the visible country-name span so "india"
    // is an exact match instead of being polluted by "+91".
    const nameEl = opt.classList.contains("iti__country")
      ? opt.querySelector<HTMLElement>(".iti__country-name")
      : null;
    const text = (nameEl?.textContent ?? opt.textContent ?? "")
      .trim()
      .toLowerCase();

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
  fireMouse(topmostEl, "mousedown");
  fireMouse(topmostEl, "mouseup");
  fireMouse(topmostEl, "click");

  // intl-tel-input binds selection on the <li>, so when the topmost element
  // is a child (flag/name span) that swallowed the gesture, also click the
  // <li> directly. Plain autocompletes select via the bubbling gesture
  // alone — keep this safety net iti-only.
  if (topmostEl !== option && option.classList.contains("iti__country")) {
    fireMouse(option, "click");
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
 * The first rendered question of `kind` whose text contains any of
 * `needles` (tried in order), narrowed so `control` is typed to that kind.
 *
 * Boards phrase the same question differently, hence the needle list; the
 * `kind` guard keeps the returned control's type exact, so callers never
 * have to re-check it.
 */
function findQuestion<K extends PageQuestion["kind"]>(
  questions: readonly IndexedQuestion[],
  needles: readonly string[],
  kind: K,
):
  | (IndexedQuestion & { question: Extract<PageQuestion, { kind: K }> })
  | undefined {
  for (const needle of needles) {
    const match = questions.find(({ text }) =>
      text.toLowerCase().includes(needle),
    );
    if (match && match.question.kind === kind) {
      return match as IndexedQuestion & {
        question: Extract<PageQuestion, { kind: K }>;
      };
    }
  }
  return undefined;
}

/**
 * What a UI needs to show one field: its stable key (for editing and
 * diffing), a human label, the value that would be written, and whether
 * the value is editable as plain text.
 */
export interface FieldDescription {
  /** Stable identity for this field on this platform — used to key edits. */
  readonly key: string;
  /** Label shown in the UI, e.g. "First name". */
  readonly label: string;
  /** The value `fill()` would write right now ("" when the profile has none). */
  readonly value: string;
  /**
   * False for values a UI must not offer as a text box — the attached
   * resume is a file, shown read-only.
   */
  readonly editable: boolean;
  /**
   * Writes an edited value back into the profile a UI is holding. Always
   * present so callers need no guard; `editable: false` fields make it a
   * no-op and a UI should not call it.
   */
  update(profile: JobApplicationProfile, value: string): void;
}

/**
 * One fixed-selector field on an application form. Each instance carries
 * its own selector — there is no separate locator table. Implemented by
 * {@link TextField} (written verbatim) and {@link AutocompleteField}
 * (typeahead fields such as country and location pickers).
 */
export interface Field {
  /**
   * Fills this field when it exists on the form and is unanswered —
   * values the applicant already typed are never overwritten. Returns
   * how many fields were written (custom questions can be several).
   */
  fill(profile: JobApplicationProfile): Promise<number>;

  /**
   * Describes this field for a preview UI. Returns an empty array when
   * the field's control is not on the current page — so a sidebar lists
   * exactly what `fill()` could touch, and never a field this requisition
   * does not ask for. Purely a read of the live DOM: no side effects.
   */
  describe(profile: JobApplicationProfile): FieldDescription[];
}

/** A `personalInfo` key whose value is plain text (i.e. not the resume). */
type TextProfileKey = Exclude<keyof PersonalInfo, "resume">;

/** A field whose value is written verbatim into its input or select. */
export class TextField implements Field {
  constructor(
    private readonly selector: string,
    private readonly key: TextProfileKey,
    private readonly label: string,
  ) {}

  async fill(profile: JobApplicationProfile): Promise<number> {
    const value = profile.personalInfo[this.key];
    if (value === "") return 0; // nothing in the profile for this field

    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      this.selector,
    );
    if (!el || el.value.trim() !== "") return 0;

    setFieldValue(el, value);
    return 1;
  }

  describe(profile: JobApplicationProfile): FieldDescription[] {
    // Absent selector = this requisition does not ask for this field, so a
    // preview UI must not list it.
    if (document.querySelector(this.selector) === null) return [];

    return [
      {
        key: this.key,
        label: this.label,
        value: profile.personalInfo[this.key],
        editable: true,
        update: (target, value) => {
          target.personalInfo[this.key] = value;
        },
      },
    ];
  }
}

/**
 * A typeahead-style field (country and location pickers, for example):
 * the value is written paste-style and the matching dropdown option is
 * clicked. Awaited — focusing the next field would blur and close this
 * field's dropdown before its option gets clicked.
 */
export class AutocompleteField implements Field {
  constructor(
    private readonly selector: string,
    private readonly key: TextProfileKey,
    private readonly label: string,
  ) {}

  async fill(profile: JobApplicationProfile): Promise<number> {
    const value = profile.personalInfo[this.key];
    if (value === "") return 0; // nothing in the profile for this field

    const input = document.querySelector<HTMLInputElement>(this.selector);
    if (!input || input.value.trim() !== "") return 0;

    await fillAutocomplete(input, value);
    return 1;
  }

  describe(profile: JobApplicationProfile): FieldDescription[] {
    // Same contract as TextField — an absent control means this requisition
    // does not ask for the field, so a preview UI must not list it.
    if (document.querySelector(this.selector) === null) return [];

    return [
      {
        key: this.key,
        label: this.label,
        value: profile.personalInfo[this.key],
        editable: true,
        update: (target, value) => {
          target.personalInfo[this.key] = value;
        },
      },
    ];
  }
}

/**
 * The stored resume, attached to the file upload input.
 *
 * Browsers block assigning a path to `input.value`, and `input.files` can
 * only accept a `FileList` produced from user interaction or a
 * `DataTransfer`. We rebuild the original `File` from the stored base64
 * and feed it through a `DataTransfer` — the same technique file-attaching
 * extensions use — then dispatch `input`/`change` so framework listeners
 * (e.g. React) see the upload.
 */
export class ResumeField implements Field {
  constructor(
    private readonly selector: string,
    private readonly getValue: (
      profile: JobApplicationProfile,
    ) => ResumeFile | null,
  ) {}

  async fill(profile: JobApplicationProfile): Promise<number> {
    const resume = this.getValue(profile);
    if (!isResumeFile(resume)) return 0;

    const input = document.querySelector<HTMLInputElement>(this.selector);
    if (input?.type !== "file") return 0;

    if (input.files && input.files.length > 0) {
      log.info(`resume already attached — leaving it untouched.`);
      return 0;
    }

    const binary = atob(resume.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const file = new File([bytes], resume.name, { type: resume.mimeType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    log.info(`attached resume "${resume.name}" (${resume.size} bytes).`);
    return 1;
  }

  describe(profile: JobApplicationProfile): FieldDescription[] {
    const input = document.querySelector<HTMLInputElement>(this.selector);
    // No upload field on this form, or a file is already attached — `fill()`
    // would do nothing, so a preview UI must not offer it.
    if (input?.type !== "file") return [];
    if (input.files && input.files.length > 0) return [];

    const resume = this.getValue(profile);
    return [
      {
        key: "resume",
        label: "Resume",
        value: isResumeFile(resume) ? resume.name : "",
        // A file cannot be retyped into a text box — the UI shows it
        // read-only; the stored resume is what gets attached.
        editable: false,
        update: () => {},
      },
    ];
  }
}

/**
 * Fills every stored custom question whose text appears within a rendered
 * question on the form (first match wins — keep stored questions
 * distinctive). Never overwrites: answered questions and already-selected
 * dropdowns are skipped, and a stored answer with no matching option is
 * reported, not guessed.
 */
export class CustomQuestionsField implements Field {
  async fill(profile: JobApplicationProfile): Promise<number> {
    const entries = profile.customQuestions ?? []; // profiles saved before custom questions
    if (entries.length === 0) return 0;

    const pageQuestions = collectPageQuestions();
    let filledCount = 0;

    for (const entry of entries) {
      const question = entry.question.trim();
      const answer = entry.answer.trim();
      if (question === "" || answer === "") continue;

      const match = pageQuestions.find(({ text }) => text.includes(question));
      if (!match) {
        log.info(`no question on this form contains "${question}".`);
        continue;
      }
      const pageQuestion = match.question;

      switch (pageQuestion.kind) {
        case "text": {
          if (pageQuestion.control.value.trim() !== "") break; // never overwrite
          setFieldValue(pageQuestion.control, answer);
          filledCount += 1;
          break;
        }

        case "select": {
          if (pageQuestion.control.value !== "") break;
          const option = [...pageQuestion.control.options].find(
            (candidate) =>
              candidate.value === answer ||
              (candidate.textContent ?? "").trim() === answer,
          );
          if (option) {
            setFieldValue(pageQuestion.control, option.value);
            filledCount += 1;
          } else {
            log.warn(`question matched but no option "${answer}" exists.`);
          }
          break;
        }

        case "combobox": {
          const control = pageQuestion.control;
          // react-select renders the chosen option inside the control shell —
          // a present `.select__single-value` means this question is answered.
          const shell = control.closest(".select__control");
          if (
            control.value.trim() !== "" ||
            shell?.querySelector(".select__single-value")
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
   * Lists every stored custom question that matches a question rendered on
   * this form. Questions with no match here are exactly the ones `fill()`
   * skips, so a preview UI shows the form's real coverage instead of the
   * user's whole saved list.
   */
  describe(profile: JobApplicationProfile): FieldDescription[] {
    const entries = profile.customQuestions ?? [];
    if (entries.length === 0) return [];

    const pageQuestions = collectPageQuestions();
    const descriptions: FieldDescription[] = [];

    for (const entry of entries) {
      const question = entry.question.trim();
      if (question === "" || entry.answer.trim() === "") continue;

      const match = pageQuestions.find(({ text }) => text.includes(question));
      if (!match) continue;

      // Keyed by the stored question text: that is what identifies the
      // entry within `customQuestions`, and it is stable across renders.
      const update = (target: JobApplicationProfile, value: string): void => {
        const found = target.customQuestions.find(
          (candidate) => candidate.question === entry.question,
        );
        if (found) found.answer = value;
      };

      descriptions.push({
        key: `custom:${question}`,
        label: match.text.trim() || question,
        value: entry.answer,
        editable: true,
        update,
      });
    }

    return descriptions;
  }
}

/**
 * A requisition-specific free-text question with no fixed selector,
 * located by the first of its needles that appears (case-insensitively)
 * in the rendered question text — boards phrase the same question in
 * different ways ("How did you hear about us?", "How did you first hear
 * about us?"). Surfaced as a first-class optional field when a value
 * appears on nearly every application (a LinkedIn URL, for example).
 * Filled verbatim; never overwrites a value the applicant already typed.
 */
export class TextQuestionField implements Field {
  constructor(
    private readonly needles: readonly string[],
    private readonly key: TextProfileKey,
    private readonly label: string,
  ) {}

  async fill(profile: JobApplicationProfile): Promise<number> {
    const value = profile.personalInfo[this.key].trim();
    if (!value) return 0;

    const match = findQuestion(collectPageQuestions(), this.needles, "text");
    if (!match) return 0;

    if (match.question.control.value.trim() !== "") return 0; // never overwrite
    setFieldValue(match.question.control, value);
    return 1;
  }

  describe(profile: JobApplicationProfile): FieldDescription[] {
    const match = findQuestion(collectPageQuestions(), this.needles, "text");
    if (!match) return [];

    return [
      {
        key: this.key,
        label: this.label,
        value: profile.personalInfo[this.key],
        editable: true,
        update: (target, value) => {
          target.personalInfo[this.key] = value;
        },
      },
    ];
  }
}

/**
 * A requisition-specific react-select combobox question, located by the
 * first of its needles that appears (case-insensitively) in the rendered
 * question text. Filled by typing the answer and clicking the exact
 * matching option — a partial answer must never pick an option, since
 * comboboxes only accept values from their dropdown. Never overwrites an
 * already-selected value.
 */
export class ComboboxQuestionField implements Field {
  constructor(
    private readonly needles: readonly string[],
    private readonly key: TextProfileKey,
    private readonly label: string,
  ) {}

  async fill(profile: JobApplicationProfile): Promise<number> {
    const value = profile.personalInfo[this.key].trim();
    if (!value) return 0;

    const match = findQuestion(
      collectPageQuestions(),
      this.needles,
      "combobox",
    );
    if (!match) return 0;

    const control = match.question.control;
    // react-select renders the chosen option inside the control shell —
    // a present `.select__single-value` means this question is answered.
    const shell = control.closest(".select__control");
    if (
      control.value.trim() !== "" ||
      shell?.querySelector(".select__single-value")
    ) {
      return 0; // never overwrite
    }

    // Type the answer, react-select filters to the matching option, and
    // the exact-only matcher clicks it.
    const clicked = await fillAutocomplete(control, value, true);
    return clicked ? 1 : 0;
  }

  describe(profile: JobApplicationProfile): FieldDescription[] {
    const match = findQuestion(
      collectPageQuestions(),
      this.needles,
      "combobox",
    );
    if (!match) return [];

    const control = match.question.control;
    const shell = control.closest(".select__control");
    if (
      control.value.trim() !== "" ||
      shell?.querySelector(".select__single-value")
    ) {
      return []; // already answered — fill() would skip it
    }

    return [
      {
        key: this.key,
        label: this.label,
        value: profile.personalInfo[this.key],
        editable: true,
        update: (target, value) => {
          target.personalInfo[this.key] = value;
        },
      },
    ];
  }
}
