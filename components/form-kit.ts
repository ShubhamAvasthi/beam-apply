/**
 * Dependency-free form control factories shared by BeamApply interfaces.
 *
 * Every factory wires behaviour (ids, labels, events) up front so call sites
 * stay declarative — the same philosophy as the starter's `setupCounter`.
 */

let uid = 0;

/** Generates a unique, stable-per-session id for wiring `<label for>`. */
function nextId(prefix: string): string {
  uid += 1;
  return `beam-${prefix}-${uid}`;
}

/** Handle returned by {@link createSection}. */
export interface SectionHandle {
  /** The `<section class="card">` root; append this into the page. */
  root: HTMLElement;
  /** Container for the section's fields. */
  body: HTMLElement;
}

/** Creates a titled, optionally hinted card section. */
export function createSection(title: string, hint?: string): SectionHandle {
  const root = document.createElement('section');
  root.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = title;
  root.append(heading);

  if (hint !== undefined) {
    const hintEl = document.createElement('p');
    hintEl.className = 'hint';
    hintEl.textContent = hint;
    root.append(hintEl);
  }

  const body = document.createElement('div');
  body.className = 'card-body';
  root.append(body);

  return { root, body };
}

export interface TextInputOptions {
  type?: 'text' | 'email' | 'tel' | 'url' | 'date';
  placeholder?: string;
  required?: boolean;
  /** HTML autofill token, e.g. `'given-name'`, `'email'`, `'tel'`. */
  autoComplete?: AutoFill;
}

/** Creates a styled `<input>`; assign its initial value after creation. */
export function createInput(options: TextInputOptions = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = options.type ?? 'text';
  input.className = 'control';
  if (options.placeholder !== undefined) input.placeholder = options.placeholder;
  if (options.required === true) input.required = true;
  if (options.autoComplete !== undefined) input.autocomplete = options.autoComplete;
  return input;
}

/** Wraps a control with an accessible `<label>` pointed at it. */
export function createLabeledField(
  labelText: string,
  control: HTMLElement,
): HTMLDivElement {
  control.id ||= nextId('field');
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = control.id;
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}