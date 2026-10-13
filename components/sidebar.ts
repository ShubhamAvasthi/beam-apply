import sidebarStyle from "./sidebar.css?raw";

import { findAdapter } from "@/platforms";
import {
  createEmptyProfile,
  getMissingProfileFields,
  isResumeFile,
  type JobApplicationProfile,
  type PersonalInfo,
} from "@/types/profile";
import { profileStorage } from "@/utils/storage";
import { openOptionsPage } from "./autofill-button";

const HOST_ID = "beamapply-sidebar-host";
const LOG_PREFIX = "[BeamApply]";

/**
 * A `personalInfo` field the sidebar lets the user review and temporarily
 * edit. `resume` is deliberately excluded: it is a file, not a string, and
 * is rendered read-only instead.
 */
interface SidebarField {
  readonly key: Exclude<keyof PersonalInfo, "resume">;
  readonly label: string;
  readonly placeholder: string;
}

/**
 * The sidebar's inventory of reviewable fields, in the same order the
 * adapters fill them (see each adapter's `FIELDS`), so the panel reads
 * top-to-bottom in the order values land on the form.
 *
 * Required-ness is NOT declared here — {@link getMissingProfileFields}
 * derives it from `EMPTY_PROFILE` + `OPTIONAL_PERSONAL_INFO_FIELDS`, which
 * stays the single source of truth after a schema change.
 */
const SIDEBAR_FIELDS: readonly SidebarField[] = [
  { key: "firstName", label: "First name", placeholder: "Jane" },
  { key: "lastName", label: "Last name", placeholder: "Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com" },
  { key: "phone", label: "Phone", placeholder: "+1 555 123 4567" },
  { key: "country", label: "Country", placeholder: "United States" },
  { key: "location", label: "Location", placeholder: "San Francisco, CA" },
  {
    key: "linkedIn",
    label: "LinkedIn profile",
    placeholder: "linkedin.com/in/jane",
  },
  {
    key: "willingToRelocate",
    label: "Willing to relocate",
    placeholder: "Yes",
  },
  {
    key: "howDidYouHear",
    label: "How did you hear about us?",
    placeholder: "A colleague",
  },
];

type StatusTone = "ok" | "error" | "muted";

/**
 * Mounts the BeamApply application sidebar.
 *
 * The panel lists every value autofill would write — the core profile fields
 * plus each stored custom-question answer — lets the user tweak any of them
 * for this one application without touching the saved profile, and carries
 * the button that fills the form from those (possibly edited) values.
 *
 * Edits live only in memory: filling always uses the working copy, and
 * "Reset edits" restores the stored profile. Only the top frame gets a
 * sidebar — a full-height panel inside an iframe is noise, so sub-frames
 * keep the floating pill (see `mountAutofillButton`).
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
  /** Working copy: the stored profile plus any temporary local edits. */
  let profile: JobApplicationProfile = createEmptyProfile();
  /** True once the user edits anything, so storage changes never clobber. */
  let dirty = false;
  let filling = false;

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

  // Collapsed-state affordance: a slim vertical rail reopens the panel.
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

  const profileSection = document.createElement("section");
  profileSection.className = "section";

  const profileHeading = document.createElement("h3");
  profileHeading.className = "section-title";
  profileHeading.textContent = "Profile";
  profileSection.append(profileHeading);

  /** Input per core field, so the working copy can be read back. */
  const inputs = new Map<SidebarField["key"], HTMLInputElement>();

  for (const field of SIDEBAR_FIELDS) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.dataset.key = field.key;

    const label = document.createElement("label");
    label.className = "field-label";
    label.htmlFor = `${HOST_ID}-${field.key}`;
    label.textContent = field.label;

    const input = document.createElement("input");
    input.type = "text";
    input.id = `${HOST_ID}-${field.key}`;
    input.className = "field-input";
    input.placeholder = field.placeholder;
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      profile.personalInfo[field.key] = input.value;
      markDirty();
      refreshMissing();
    });

    wrapper.append(label, input);
    profileSection.append(wrapper);
    inputs.set(field.key, input);
  }

  // The resume cannot be typed into — show what would be attached instead.
  const resumeWrapper = document.createElement("div");
  resumeWrapper.className = "field";
  resumeWrapper.dataset.key = "resume";

  const resumeLabel = document.createElement("label");
  resumeLabel.className = "field-label";
  resumeLabel.textContent = "Resume";

  const resumeValue = document.createElement("span");
  resumeValue.className = "field-input";
  resumeValue.setAttribute("aria-readonly", "true");

  const resumeHint = document.createElement("p");
  resumeHint.className = "hint";
  resumeHint.textContent = "Attached from your saved profile.";

  resumeWrapper.append(resumeLabel, resumeValue, resumeHint);
  profileSection.append(resumeWrapper);
  body.append(profileSection);

  // Stored answers for requisition-specific questions.
  const questionsSection = document.createElement("section");
  questionsSection.className = "section";

  const questionsHeading = document.createElement("h3");
  questionsHeading.className = "section-title";
  questionsHeading.textContent = "Custom questions";

  const questionsList = document.createElement("div");
  const questionsEmpty = document.createElement("p");
  questionsEmpty.className = "empty";
  questionsEmpty.textContent = "No saved custom questions.";

  questionsSection.append(questionsHeading, questionsEmpty, questionsList);
  body.append(questionsSection);

  // ---- footer -----------------------------------------------------------
  const fillButton = document.createElement("button");
  fillButton.type = "button";
  fillButton.className = "fill-button";
  fillButton.textContent = "⚡ Autofill this application";
  fillButton.addEventListener("click", () => void fill());

  // Not named `status` — that shadows the deprecated `window.status`.
  const statusText = document.createElement("span");
  statusText.className = "status";
  statusText.dataset.tone = "muted";

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
  footer.append(fillButton, statusText, footerRow);

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
    statusText.textContent = text;
    statusText.dataset.tone = tone;
  }

  function markDirty(): void {
    dirty = true;
    resetButton.hidden = false;
  }

  /** Pushes the working copy into the DOM (never steals the focused input). */
  function syncInputs(): void {
    for (const [key, input] of inputs) {
      if (input === shadowRoot.activeElement) continue;
      input.value = profile.personalInfo[key] ?? "";
    }

    const resume = profile.personalInfo.resume;
    resumeValue.textContent = isResumeFile(resume)
      ? `${resume.name} · ${resume.mimeType}`
      : "No resume attached";

    // Rebuild the custom-question rows, restoring focus to the answer being
    // typed — the rebuild discards the element the user is sitting in.
    const active = shadowRoot.activeElement as HTMLInputElement | null;
    const focusedIndex = Number(active?.dataset.question ?? "");
    questionsList.replaceChildren();

    for (const [index, entry] of profile.customQuestions.entries()) {
      const wrapper = document.createElement("div");
      wrapper.className = "field";

      const label = document.createElement("label");
      label.className = "field-label";
      label.textContent = entry.question;

      const answer = document.createElement("input");
      answer.type = "text";
      answer.className = "field-input";
      answer.placeholder = "Answer";
      answer.autocomplete = "off";
      answer.dataset.question = String(index);
      answer.value = entry.answer;
      answer.addEventListener("input", () => {
        const target = profile.customQuestions[index];
        if (!target) return;
        target.answer = answer.value;
        markDirty();
      });

      wrapper.append(label, answer);
      questionsList.append(wrapper);
    }

    questionsEmpty.hidden = profile.customQuestions.length > 0;
    if (focusedIndex >= 0) {
      questionsList
        .querySelector<HTMLInputElement>(`[data-question="${focusedIndex}"]`)
        ?.focus();
    }
  }

  /** Flags required-but-empty fields and gates the fill button. */
  function refreshMissing(): void {
    const missing = new Set(getMissingProfileFields(profile));

    for (const [key, input] of inputs) {
      input
        .closest(".field")
        ?.setAttribute("data-missing", String(missing.has(key)));
    }
    resumeWrapper.setAttribute("data-missing", String(missing.has("resume")));

    fillButton.disabled = filling || missing.size > 0 || !adapter;
    fillButton.textContent = adapter
      ? "⚡ Autofill this application"
      : "Autofill unsupported here";

    if (filling || statusText.dataset.tone === "error") return;
    setStatus(
      adapter
        ? missing.size > 0
          ? `Missing: ${[...missing].join(", ")}`
          : "Ready — review and fill."
        : "This page isn't a supported job board.",
      missing.size > 0 ? "error" : "muted",
    );
  }

  async function fill(): Promise<void> {
    if (!adapter || filling) return;

    filling = true;
    refreshMissing();
    setStatus("Filling…", "muted");

    try {
      const filledCount = await adapter.autofill(profile);
      setStatus(
        filledCount > 0
          ? `Filled ${filledCount} field(s).`
          : "Nothing to fill.",
        filledCount > 0 ? "ok" : "muted",
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} sidebar autofill failed`, error);
      setStatus("Autofill failed — see console.", "error");
    } finally {
      filling = false;
      refreshMissing();
    }
  }

  async function reset(): Promise<void> {
    profile = await profileStorage.getValue();
    dirty = false;
    resetButton.hidden = true;
    syncInputs();
    refreshMissing();
  }

  // A save from the options page must never discard in-progress edits.
  profileStorage.watch((next) => {
    if (dirty || !next) return;
    profile = next;
    syncInputs();
    refreshMissing();
  });

  void reset();
}
