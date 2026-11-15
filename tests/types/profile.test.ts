import { describe, expect, it } from "vitest";
import {
  createEmptyProfile,
  getMissingProfileFields,
  isResumeFile,
  type JobApplicationProfile,
} from "@/types/profile";
import { DEV_TEST_PROFILE } from "@/utils/dev-profile";
import { testProfile } from "../helpers/profile";

/** Every required personalInfo field, in declaration order. */
const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "country",
  "location",
  "resume",
];

describe("createEmptyProfile", () => {
  it("returns an independent copy on every call", () => {
    const first = createEmptyProfile();
    first.personalInfo.firstName = "changed";
    first.customQuestions.push({ question: "q", answer: "a" });

    const second = createEmptyProfile();
    expect(second.personalInfo.firstName).toBe("");
    expect(second.customQuestions).toEqual([]);
  });
});

describe("isResumeFile", () => {
  it("accepts a well-formed resume", () => {
    expect(isResumeFile(testProfile().personalInfo.resume)).toBe(true);
  });

  it.each([
    ["null", null],
    ["the legacy empty-string format", ""],
    ["an object missing base64", { name: "a.pdf", mimeType: "x", size: 1 }],
    [
      "an object with a string size",
      { name: "a.pdf", mimeType: "x", size: "1", base64: "" },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isResumeFile(value)).toBe(false);
  });
});

describe("getMissingProfileFields", () => {
  it("reports every required field of an empty profile, in order", () => {
    expect(getMissingProfileFields(createEmptyProfile())).toEqual(
      REQUIRED_FIELDS,
    );
  });

  it("reports nothing for a complete profile", () => {
    expect(getMissingProfileFields(testProfile())).toEqual([]);
  });

  it("treats the dev fixture as complete", () => {
    expect(getMissingProfileFields(DEV_TEST_PROFILE)).toEqual([]);
  });

  it("never reports optional fields", () => {
    const profile = testProfile();
    profile.personalInfo.linkedIn = "";
    profile.personalInfo.willingToRelocate = "";
    profile.personalInfo.howDidYouHear = "";
    expect(getMissingProfileFields(profile)).toEqual([]);
  });

  it("reports a resume stored in the legacy string format", () => {
    const profile = testProfile();
    (profile.personalInfo as Record<string, unknown>).resume = "resume.pdf";
    expect(getMissingProfileFields(profile)).toEqual(["resume"]);
  });

  it("reports a field absent from an older saved profile", () => {
    const profile = testProfile();
    delete (profile.personalInfo as Partial<typeof profile.personalInfo>)
      .location;
    expect(getMissingProfileFields(profile)).toEqual(["location"]);
  });

  it("reports everything when personalInfo itself is absent", () => {
    const profile = {
      customQuestions: [],
      updatedAt: null,
    } as unknown as JobApplicationProfile;
    expect(getMissingProfileFields(profile)).toEqual(REQUIRED_FIELDS);
  });
});
