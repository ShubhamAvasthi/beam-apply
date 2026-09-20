/**
 * Greenhouse job-board adapter.
 *
 * Defines which fields Greenhouse forms render (see {@link FIELDS}) using
 * the shared field objects — everything about *how* a value is written
 * lives in `platforms/fields.ts`; this file owns *which* fields exist and
 * where each one's value comes from in the profile.
 */
import type { PlatformAdapter } from "./types";
import {
  AutocompleteField,
  ComboboxQuestionField,
  CustomQuestionsField,
  ResumeField,
  TextField,
  TextQuestionField,
  type Field,
} from "./fields";

const LOG_PREFIX = "[BeamApply/greenhouse]";

/**
 * Every autofillable field on Greenhouse, in fill order — the order a
 * button click fills them in, with dropdown-driven fields awaited so a
 * later field's focus can't close an earlier field's dropdown. Adding a
 * field = adding one object here.
 */
const FIELDS: readonly Field[] = [
  new TextField("#first_name", (profile) => profile.personalInfo.firstName),
  new TextField("#last_name", (profile) => profile.personalInfo.lastName),
  new TextField("#email", (profile) => profile.personalInfo.email),
  new TextField("#phone", (profile) => profile.personalInfo.phone),
  new AutocompleteField("#country", (profile) => profile.personalInfo.country),
  new AutocompleteField(
    "#candidate-location",
    (profile) => profile.personalInfo.location,
  ),
  new ResumeField("#resume", (profile) => profile.personalInfo.resume),
  new CustomQuestionsField(),
  new TextQuestionField(
    ["linkedin profile"],
    (profile) => profile.personalInfo.linkedIn,
  ),
  new ComboboxQuestionField(
    ["willing to relocate"],
    (profile) => profile.personalInfo.willingToRelocate,
  ),
  new TextQuestionField(
    ["how did you hear", "how did you first hear"],
    (profile) => profile.personalInfo.howDidYouHear,
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
};
