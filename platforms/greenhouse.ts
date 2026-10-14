/**
 * Greenhouse job-board adapter.
 *
 * Defines which fields Greenhouse forms render (see {@link FIELDS}) using
 * the shared field objects — everything about *how* a value is written
 * lives in `platforms/fields.ts`; this file owns *which* fields exist and
 * where each one's value comes from in the profile.
 */
import type { JobApplicationProfile } from "~/types/profile";
import {
  AutocompleteField,
  ComboboxQuestionField,
  CustomQuestionsField,
  type Field,
  type FieldDescription,
  ResumeField,
  TextField,
  TextQuestionField,
} from "./fields";
import type { PlatformAdapter } from "./types";

const LOG_PREFIX = "[BeamApply/greenhouse]";

/**
 * Every autofillable field on Greenhouse, in fill order — the order a
 * button click fills them in, with dropdown-driven fields awaited so a
 * later field's focus can't close an earlier field's dropdown. Adding a
 * field = adding one object here.
 */
const FIELDS: readonly Field[] = [
  new TextField("#first_name", "firstName", "First name"),
  new TextField("#last_name", "lastName", "Last name"),
  new TextField("#email", "email", "Email"),
  new TextField("#phone", "phone", "Phone"),
  new AutocompleteField("#country", "country", "Country"),
  new AutocompleteField("#candidate-location", "location", "Location"),
  new ResumeField("#resume", (profile) => profile.personalInfo.resume),
  new CustomQuestionsField(),
  new TextQuestionField(["linkedin profile"], "linkedIn", "LinkedIn profile"),
  new ComboboxQuestionField(
    ["willing to relocate"],
    "willingToRelocate",
    "Willing to relocate",
  ),
  new TextQuestionField(
    ["how did you hear", "how did you first hear"],
    "howDidYouHear",
    "How did you hear about the company?",
  ),
];

export const greenhouseAdapter: PlatformAdapter = {
  id: "greenhouse",
  hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io"],

  /** Runs on button click — every init race on the page is over by then. */
  async autofill(profile) {
    let filledCount = 0;
    let customCount = 0;

    for (const field of FIELDS) {
      const count = await field.fill(profile);
      filledCount += count;
      if (field instanceof CustomQuestionsField) customCount = count;
    }

    if (filledCount === 0) {
      console.info(`${LOG_PREFIX} nothing to fill.`);
    } else {
      console.info(
        `${LOG_PREFIX} filled ${filledCount} field(s)` +
          (customCount > 0
            ? ` (including ${customCount} custom question(s))`
            : "") +
          ".",
      );
    }
    return filledCount;
  },

  /**
   * The page's fields, labelled for the sidebar's review list. Each field
   * decides whether it applies to the currently-rendered form (returning
   * `[]` when it does not), so the result is exactly what {@link autofill}
   * could write right now — `flatMap` collapses those per-field arrays.
   */
  describe(profile: JobApplicationProfile): FieldDescription[] {
    return FIELDS.flatMap((field) => field.describe(profile));
  },
};
