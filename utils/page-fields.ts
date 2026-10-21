/**
 * Shared page-field discovery, used by every platform adapter.
 *
 * Instead of each adapter reaching into the DOM with its own selectors,
 * `collectPageFields()` indexes every labeled question on the page once as
 * `PageField` objects — question text plus control metadata — so rule
 * matchers and fillers can test against the object instead of the HTML.
 * This keeps platform adapters thin and makes adding a new platform just
 * a matter of composing the shared field objects.
 */

/**
 * One rendered question on the current form, with all the metadata needed
 * to match rules against it — instead of reaching into the HTML directly.
 *
 * - `text` — the question text, from its `<label>` (falling back to the
 *   control's own `aria-label`, which carries the same question text on
 *   live forms). Kept exactly as rendered — matching is a plain substring
 *   test against it.
 * - `kind` — `text` for free-text input / textarea; `combobox` for
 *   react-select controls; `select` for native dropdowns.
 * - `control` — the actual DOM element, still needed to write values into.
 * - `classes` / `id` / `name` / `inputType` / `value` / `placeholder` /
 *   `required` — control attributes, split out so rule matchers can test
 *   them without touching the DOM again.
 *
 * Radio and checkbox questions are deliberately not indexed.
 */
export interface PageField {
  readonly text: string;
  readonly kind: "text" | "combobox" | "select";
  readonly control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  readonly classes: string[];
  readonly id: string | null;
  readonly name: string | null;
  readonly inputType: string | null;
  readonly value: string;
  readonly placeholder: string | null;
  readonly required: boolean;
}

/**
 * Substring rules mapping a PageField's rendered question text to a
 * `personalInfo` profile key. A field matches when its `text` (lowercased)
 * contains the needle. The first matching rule wins.
 *
 * These are intentionally broad — "email" matches "Work email" and
 * "Email address" alike — so one rule covers every board's phrasing.
 */
export const PROFILE_KEY_RULES: readonly {
  readonly needle: string;
  readonly key: string;
}[] = [
  { needle: "first name", key: "firstName" },
  { needle: "firstname", key: "firstName" },
  { needle: "last name", key: "lastName" },
  { needle: "lastname", key: "lastName" },
  { needle: "email", key: "email" },
  { needle: "phone", key: "phone" },
  { needle: "country", key: "country" },
  { needle: "location", key: "location" },
  { needle: "linkedin", key: "linkedIn" },
  { needle: "relocate", key: "willingToRelocate" },
  { needle: "how did you hear", key: "howDidYouHear" },
];

/**
 * Returns the `personalInfo` key a `PageField` matches, or `undefined` when
 * no rule applies. Callers can use the returned key to read the profile
 * value and prefill the field without touching the DOM again — the
 * `PageField.control` reference is all that's needed to write it back.
 */
export function matchProfileKey(field: PageField): string | undefined {
  const text = field.text.toLowerCase();
  for (const { needle, key } of PROFILE_KEY_RULES) {
    if (text.includes(needle)) return key;
  }
  return undefined;
}

const TEXT_INPUT_TYPES = new Set(["text", "email", "tel", "url", "number"]);

/**
 * Indexes every labeled question on the page as `PageField` objects —
 * question text plus control metadata — so rule matchers can test against
 * the object instead of the HTML.
 */
export function collectPageFields(): PageField[] {
  const fields: PageField[] = [];

  for (const label of document.querySelectorAll<HTMLLabelElement>(
    "label[for]",
  )) {
    const control = document.getElementById(label.htmlFor);
    if (!control) continue;

    const text = label.textContent || control.getAttribute("aria-label") || "";

    let kind: PageField["kind"];
    if (control instanceof HTMLInputElement) {
      if (control.getAttribute("role") === "combobox") {
        kind = "combobox";
      } else if (TEXT_INPUT_TYPES.has(control.type)) {
        kind = "text";
      } else {
        continue; // not a text-like input (checkbox, radio, button, etc.)
      }
    } else if (control instanceof HTMLSelectElement) {
      kind = "select";
    } else if (control instanceof HTMLTextAreaElement) {
      kind = "text";
    } else {
      continue;
    }

    fields.push({
      text,
      kind,
      control,
      classes: control.className ? control.className.split(/\s+/) : [],
      id: control.id || null,
      name: control.getAttribute("name") || null,
      inputType: control instanceof HTMLInputElement ? control.type : null,
      value: control.value,
      placeholder: control.getAttribute("placeholder") || null,
      required: control.required,
    });
  }

  return fields;
}

/**
 * The first rendered field of `kind` whose text contains any of
 * `needles` (tried in order), narrowed so `control` is typed to that kind.
 *
 * Boards phrase the same question differently, hence the needle list; the
 * `kind` guard keeps the returned control's type exact, so callers never
 * have to re-check it.
 */
export function findQuestion<K extends PageField["kind"]>(
  questions: readonly PageField[],
  needles: readonly string[],
  kind: K,
): (PageField & { kind: K }) | undefined {
  for (const needle of needles) {
    const match = questions.find(({ text }) =>
      text.toLowerCase().includes(needle),
    );
    if (match && match.kind === kind) {
      return match as PageField & { kind: K };
    }
  }
  return undefined;
}
