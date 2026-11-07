import sidebarStyle from "./sidebar.css?raw";

import { findAdapter } from "@/platforms";
import type { FieldDescription } from "@/platforms/fields";
import { setFieldValue, type TextProfileKey } from "@/platforms/fields";
import { createEmptyProfile, getMissingProfileFields } from "@/types/profile";
import { createLogger } from "@/utils/logger";
import {
  collectPageFields,
  matchProfileKey,
  type PageField,
} from "@/utils/page-fields";
import { profileStorage } from "@/utils/storage";
import { openOptionsPage } from "./autofill-button";

const HOST_ID = "beamapply-sidebar-host";
const log = createLogger("sidebar");

type StatusTone = "ok" | "error" | "muted";

/**
 * Mounts the BeamApply application sidebar.
 *
 * The panel lists every question detected on the page, whether or not the
 * adapter knows about it. Fields matching a stored profile key (email, name,
 * phone, etc.) are prefilled from the profile and editable; everything else
 * is shown with its current DOM value and also editable — edits write
 * straight back to the page control. Edits stay in an in-memory working copy
 * and "Reset edits" restores the stored profile. The panel carries the
 * button that fills the form from those (possibly edited) values.
 *
 * Only the top frame gets a sidebar — a full-height panel inside an iframe
 * is noise, so sub-frames keep the floating pill (see mountAutofillButton).
 */
export function mountSidebar(): void {
  if (window !== window.top) return;
  if (document.getElementById(HOST_ID) !== null) return;

  const hostname = window.location.hostname;
  const adapter = findAdapter(hostname);

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = sidebarStyle;
  shadowRoot.append(style);

  // ---- state ------------------------------------------------------------
  /** Working copy: the stored profile, plus any temporary local edits. */
  let profile = createEmptyProfile();
  /** True once the user edits anything, so storage changes don't clobber. */
  let dirty = false;
  let filling = false;
  /** Descriptors for the fields currently rendered on the page. */
  let descriptors: readonly FieldDescription[] = [];
  /** PageField references keyed by descriptor key, so fill() can write
   *  directly to `control` without re-querying the DOM. */
  const pageFieldByKey = new Map<string, PageField>();
  /** Whether fields have been fetched from the page yet. Fields are only
   *  fetched after the user clicks Autofill, so react-select dropdowns are
   *  open and their `.select__option` nodes are in the DOM when we scrape
   *  them for the sidebar select boxes. */
  let fieldsFetched = false;

  // ---- header -----------------------------------------------------------
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "BeamApply";

  const hostLabel = document.createElement("span");
  hostLabel.className = "host";
  hostLabel.textContent = hostname;

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "icon-button";
  editButton.textContent = "✎";
  editButton.title = "Edit saved profile";
  editButton.setAttribute("aria-label", "Edit saved profile");
  editButton.addEventListener("click", () => void openOptionsPage());

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.className = "icon-button";
  collapseButton.textContent = "—";
  collapseButton.title = "Collapse sidebar";
  collapseButton.setAttribute("aria-label", "Collapse sidebar");
  collapseButton.addEventListener("click", () => {
    host.setAttribute("data-collapsed", "");
  });

  const header = document.createElement("header");
  header.className = "header";
  header.append(title, hostLabel, editButton, collapseButton);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "tab";
  openButton.textContent = "⚡ BeamApply";
  openButton.title = "Open BeamApply sidebar";
  openButton.setAttribute("aria-label", "Open BeamApply sidebar");
  openButton.addEventListener("click", () => {
    host.removeAttribute("data-collapsed");
  });

  // ---- body -------------------------------------------------------------
  const body = document.createElement("div");
  body.className = "body";

  const fieldsSection = document.createElement("section");
  fieldsSection.className = "section";

  const fieldsHeading = document.createElement("h3");
  fieldsHeading.className = "section-title";
  fieldsHeading.textContent = "This form";

  const fieldsList = document.createElement("div");

  const fieldsEmpty = document.createElement("p");
  fieldsEmpty.className = "empty";
  fieldsEmpty.hidden = true;

  fieldsSection.append(fieldsHeading, fieldsEmpty, fieldsList);
  body.append(fieldsSection);

  // ---- footer -----------------------------------------------------------
  const fillButton = document.createElement("button");
  fillButton.type = "button";
  fillButton.className = "fill-button";
  fillButton.textContent = "⚡ Autofill this application";
  fillButton.addEventListener("click", () => void fill());

  const status = document.createElement("span");
  status.className = "status";
  status.dataset.tone = "muted";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "link-button";
  resetButton.textContent = "Reset edits";
  resetButton.hidden = true;
  resetButton.addEventListener("click", () => void reset());

  const footerRow = document.createElement("div");
  footerRow.className = "footer-row";
  footerRow.append(resetButton);

  const footer = document.createElement("footer");
  footer.className = "footer";
  footer.append(fillButton, status, footerRow);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.append(header, body, footer);

  const shell = document.createElement("div");
  shell.className = "sidebar";
  shell.append(panel, openButton);

  shadowRoot.append(shell);
  (document.body ?? document.documentElement).appendChild(host);

  // ---- behaviour --------------------------------------------------------
  function setStatus(text: string, tone: StatusTone): void {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function markDirty(): void {
    dirty = true;
    resetButton.hidden = false;
  }

  /**
   * Re-renders the field list from the adapter's current view of the page.
   *
   * This is the whole point of the change: we ask the adapter what it
   * actually matched (`adapter.describe`) and render exactly that — a
   * question this requisition omits is simply never in `descriptors`, so it
   * never appears in the panel.
   */
  async function renderFields(): Promise<void> {
    fieldsList.replaceChildren();

    for (const descriptor of descriptors) {
      const wrapper = document.createElement("div");
      wrapper.className = "field";
      wrapper.dataset.key = descriptor.key;

      const label = document.createElement("label");
      label.className = "field-label";
      label.textContent = descriptor.label;

      if (!descriptor.editable) {
        // A value that can't be typed (the attached resume) — show it as-is.
        const value = document.createElement("span");
        value.className = "field-input";
        value.setAttribute("aria-readonly", "true");
        value.textContent = descriptor.value || "None attached";
        wrapper.append(label, value);
      } else if (descriptor.kind === "combobox") {
        // A typeahead/dropdown (e.g. react-select country picker) — offer a
        // select box so the user can pick a valid option instead of free text.
        const select = document.createElement("select");
        select.className = "field-input";

        // Current profile value as the first option.
        if (descriptor.value) {
          const current = document.createElement("option");
          current.value = descriptor.value;
          current.textContent = descriptor.value;
          select.appendChild(current);
        }

        select.value = descriptor.value;

        select.addEventListener("change", () => {
          descriptor.update(profile, select.value);
          markDirty();
          updateStatus();
        });
        wrapper.append(label, select);

        // After rendering, open the combobox to scrape its rendered options,
        // then close it. react-select only puts `.select__option` nodes in
        // the DOM while the dropdown is open, and they live inside
        // `.select__menu` (a sibling of `.select__control`), not inside it.
        await scrapeComboboxOptions(descriptor, select).catch((error) => {
          log.warn(
            `failed to scrape combobox options for "${descriptor.label}"`,
            error,
          );
        });
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "field-input";
        input.autocomplete = "off";
        input.value = descriptor.value;
        input.addEventListener("input", () => {
          descriptor.update(profile, input.value); // write into the working copy
          markDirty();
          updateStatus();
        });
        wrapper.append(label, input);
      }

      fieldsList.append(wrapper);
    }

    fieldsEmpty.hidden = descriptors.length > 0;
    fieldsEmpty.textContent = adapter
      ? "This form has no fillable fields."
      : "This page isn't a supported job board.";
  }

  /**
   * Opens a combobox dropdown, scrapes its visible `.select__option` labels,
   * then closes the dropdown. Populates `select` with the discovered options
   * so the sidebar offers valid choices instead of free text.
   *
   * react-select only renders `.select__option` nodes while the dropdown is
   * open, and they live inside `.select__menu` (a sibling of `.select__control`),
   * not inside `.select__control` itself. Options are also loaded
   * asynchronously, so we poll briefly before giving up.
   */
  async function scrapeComboboxOptions(
    descriptor: FieldDescription,
    select: HTMLSelectElement,
  ): Promise<void> {
    const pageField = descriptor.pageField;
    if (!pageField) return;

    const control = pageField.control as HTMLInputElement;
    const shell = control.closest(".select__control");
    if (!shell) return;

    log.debug("scraping combobox options for", descriptor.label);

    // Give react-select a moment to be ready before opening the dropdown.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Open the dropdown. react-select opens on mousedown of its inner input
    // (not a programmatic click on .select__control), so dispatch mousedown
    // on the input first, then click the shell as a fallback.
    const innerInput = shell.querySelector<HTMLInputElement>(
      'input[role="combobox"], input[type="text"], input:not([type="hidden"])',
    );
    log.debug("Found inner input:", innerInput);
    if (innerInput) {
      innerInput.focus({ preventScroll: true });
      innerInput.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
      innerInput.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    }

    const indicator =
      shell.querySelector<HTMLElement>(
        ".select__dropdown-indicator, [class*='indicatorContainer'], [class*='__indicators']",
      ) ?? shell;

    indicator.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 1,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Poll for up to ~3s for asynchronously loaded options.
    const seen = new Set<string>([descriptor.value].filter(Boolean));
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));

      let found = 0;

      // Broad document-wide fallback.
      found += harvestOptions(document, seen, select);

      if (found > 0) break; // options found — stop polling
    }

    // Close the dropdown with Escape key (react-select honors it).
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    // Restore the saved value if a matching option exists.
    if (descriptor.value) select.value = descriptor.value;
  }

  /**
   * Appends visible `.select__option` labels from `container` into `select`,
   * skipping any already in `seen`. Returns how many new options were added.
   */
  function harvestOptions(
    container: Element | Document,
    seen: Set<string>,
    select: HTMLSelectElement,
  ): number {
    log.debug("Harvesting options from container", container);
    let count = 0;
    for (const opt of container.querySelectorAll<HTMLElement>(
      ".select__option",
    )) {
      const computed = window.getComputedStyle(opt);
      const rect = opt.getBoundingClientRect();
      const isVisible =
        computed.display !== "none" &&
        computed.visibility !== "hidden" &&
        computed.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0;
      if (!isVisible) continue;

      const text = opt.textContent?.trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        count += 1;
        const option = document.createElement("option");
        option.value = text;
        option.textContent = text;
        select.appendChild(option);
      }
    }
    return count;
  }

  /** Recomputes the missing-field flags and gates the fill button. */
  function updateStatus(): void {
    // Typed as `Set<string>` (not `Set<keyof PersonalInfo>`) so it accepts
    // both descriptor keys and the `dataset.key` strings below.
    const missing = new Set<string>(getMissingProfileFields(profile));

    for (const wrapper of fieldsList.querySelectorAll<HTMLElement>(".field")) {
      wrapper.setAttribute(
        "data-missing",
        String(missing.has(wrapper.dataset.key ?? "")),
      );
    }

    // Only the required fields *on this page* block a fill — a field the
    // form doesn't ask for can't hold anything back.
    const missingShown = descriptors.filter((d) => missing.has(d.key));
    fillButton.disabled =
      filling ||
      !adapter ||
      descriptors.length === 0 ||
      missingShown.length > 0;

    if (filling || status.dataset.tone === "error") return;
    setStatus(
      !adapter
        ? "This page isn't a supported job board."
        : missingShown.length > 0
          ? `Missing: ${missingShown.map((d) => d.label).join(", ")}`
          : descriptors.length === 0
            ? "This form has no fillable fields."
            : "Ready — review and fill.",
      missingShown.length > 0 ? "error" : "muted",
    );
  }

  /** Re-describes the page and re-renders — used on mount, reset, and fill. */
  async function refresh(): Promise<void> {
    // 1. Ask the adapter which fields it knows about (locator-based fields
    //    such as autocomplete dropdowns that need special write logic).
    const adapterDescriptors: FieldDescription[] = adapter
      ? adapter.describe(profile)
      : [];
    const coveredKeys = new Set(adapterDescriptors.map((d) => d.key));

    // 2. Collect every question on the page and list ALL of them — not just
    //    the ones matching a profile rule. Fields with a matching rule are
    //    prefilled from the stored profile; everything else shows its current
    //    DOM value. All are editable — edits to non-rule fields write straight
    //    back to the page control via PageField.control.
    const pageFields = collectPageFields();
    const pageFieldDescriptors: FieldDescription[] = [];

    for (let i = 0; i < pageFields.length; i++) {
      const pf = pageFields[i];
      if (!pf) continue;
      const key = matchProfileKey(pf);

      // Skip if the adapter already owns this profile key (e.g. autocomplete).
      if (key && coveredKeys.has(key)) continue;

      const value = key
        ? ((profile.personalInfo[key as TextProfileKey] ?? "") as string)
        : pf.value;

      pageFieldDescriptors.push({
        key: key ?? `__pagefield_${i}`,
        label: pf.text,
        value,
        editable: true,
        pageField: pf,
        update: key
          ? (target, value) => {
              target.personalInfo[key as TextProfileKey] = value;
            }
          : (target, value) => {
              // No profile key — write the edit straight to the DOM control.
              setFieldValue(pf.control, value);
            },
      });

      if (key) pageFieldByKey.set(key, pf);
    }

    descriptors = [...adapterDescriptors, ...pageFieldDescriptors];
    if (fieldsFetched) {
      await renderFields();
    }
    updateStatus();
  }

  async function fill(): Promise<void> {
    if (filling) return;

    // Fetch fields on first Autofill click so react-select dropdowns are
    // open and their `.select__option` nodes are in the DOM when the
    // sidebar scrapes them for select-box options.
    if (!fieldsFetched) {
      fieldsFetched = true;
      await refresh();
    }

    filling = true;
    updateStatus();
    setStatus("Filling…", "muted");

    try {
      // 1. Adapter fills its locator-based fields (autocomplete, etc.).
      let filledCount = 0;
      if (adapter) {
        filledCount = await adapter.autofill(profile);
      }

      // 2. Write matched PageField values directly via PageField.control —
      //    no re-querying the DOM. Never overwrite a value already typed.
      let pageFieldFilled = 0;
      for (const [key, pf] of pageFieldByKey) {
        const value = profile.personalInfo[key as TextProfileKey]?.trim();
        if (!value) continue;
        if (pf.control.value.trim() !== "") continue; // never overwrite

        setFieldValue(pf.control, value);
        pageFieldFilled++;
      }

      const total = filledCount + pageFieldFilled;
      setStatus(
        total > 0 ? `Filled ${total} field(s).` : "Nothing to fill.",
        total > 0 ? "ok" : "muted",
      );
    } catch (error) {
      log.error("sidebar autofill failed", error);
      setStatus("Autofill failed — see console.", "error");
    } finally {
      filling = false;
      await refresh(); // reflect anything the fill answered
    }
  }

  async function loadProfile(): Promise<void> {
    profile = await profileStorage.getValue();
    dirty = false;
    resetButton.hidden = true;
  }

  async function reset(): Promise<void> {
    await loadProfile();
    // Only re-render fields if they've already been fetched (i.e. the user
    // has clicked Autofill at least once). Until then the sidebar stays empty.
    if (fieldsFetched) refresh();
  }

  // A save from the options page must never discard in-progress edits.
  profileStorage.watch((next) => {
    if (dirty || !next) return;
    profile = next;
    refresh();
  });

  void reset();
}
