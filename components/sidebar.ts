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
 * The panel shows exactly the fields autofill could write on the page as
 * currently rendered — it asks the adapter via `adapter.describe()` and
 * renders only what comes back, so a requisition that omits a question
 * simply never shows it. Each shown value is editable for this one
 * application; edits stay in an in-memory working copy and "Reset edits"
 * restores the stored profile. The panel carries the button that fills the
 * form from those (possibly edited) values.
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
  function renderFields(): void {
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
  function refresh(): void {
    // 1. Ask the adapter which fields it knows about (locator-based fields
    //    such as autocomplete dropdowns that need special write logic).
    const adapterDescriptors: FieldDescription[] = adapter
      ? adapter.describe(profile)
      : [];
    const coveredKeys = new Set(adapterDescriptors.map((d) => d.key));

    // 2. Collect every question on the page, then add the ones the adapter
    //    didn't already claim — matched by text→profile-key rules.
    const pageFields = collectPageFields();
    const pageFieldDescriptors: FieldDescription[] = [];

    for (const pf of pageFields) {
      const key = matchProfileKey(pf);
      if (!key || coveredKeys.has(key)) continue; // no rule, or adapter owns it

      const value = (profile.personalInfo[key as TextProfileKey] ??
        "") as string;

      pageFieldDescriptors.push({
        key,
        label: pf.text,
        value,
        editable: true,
        pageField: pf,
        update: (target, value) => {
          target.personalInfo[key as TextProfileKey] = value;
        },
      });
      pageFieldByKey.set(key, pf);
    }

    descriptors = [...adapterDescriptors, ...pageFieldDescriptors];
    renderFields();
    updateStatus();
  }

  async function fill(): Promise<void> {
    if (filling) return;

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
      refresh(); // reflect anything the fill answered
    }
  }

  async function reset(): Promise<void> {
    profile = await profileStorage.getValue();
    dirty = false;
    resetButton.hidden = true;
    refresh();
  }

  // A save from the options page must never discard in-progress edits.
  profileStorage.watch((next) => {
    if (dirty || !next) return;
    profile = next;
    refresh();
  });

  void reset();
}
