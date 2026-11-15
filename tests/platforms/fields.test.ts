import { describe, expect, it, vi } from "vitest";
import {
  CustomQuestionsField,
  ResumeField,
  setFieldValue,
  TextField,
  TextQuestionField,
} from "@/platforms/fields";
import { TEST_RESUME_TEXT, testProfile } from "../helpers/profile";

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

describe("setFieldValue", () => {
  /**
   * React wraps each input's `value` in an instance-level property that
   * records the last value it saw, and ignores an `input` event when the
   * DOM value still equals that record. Writing through the instance
   * updates the record (the edit is lost); writing through the prototype
   * setter bypasses it.
   */
  function trackLikeReact(element: HTMLInputElement): { tracked: string } {
    const state = { tracked: element.value };
    const native = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!;
    Object.defineProperty(element, "value", {
      configurable: true,
      get() {
        return native.get!.call(this) as string;
      },
      set(next: string) {
        state.tracked = next;
        native.set!.call(this, next);
      },
    });
    return state;
  }

  it("writes past a framework's value tracker", () => {
    document.body.innerHTML = `<input id="a">`;
    const tracker = trackLikeReact(input("a"));

    setFieldValue(input("a"), "Ada");

    expect(input("a").value).toBe("Ada");
    expect(tracker.tracked).toBe(""); // React sees a change it didn't make
  });

  it("fires bubbling input and change events", () => {
    document.body.innerHTML = `<form><input id="a"></form>`;
    const seen: string[] = [];
    document
      .querySelector("form")!
      .addEventListener("input", () => seen.push("input"));
    document
      .querySelector("form")!
      .addEventListener("change", () => seen.push("change"));

    setFieldValue(input("a"), "Ada");

    expect(seen).toEqual(["input", "change"]);
  });

  it("selects an option of a native dropdown", () => {
    document.body.innerHTML = `<select id="s"><option value="">-</option><option value="uk">UK</option></select>`;
    const select = document.getElementById("s") as HTMLSelectElement;

    setFieldValue(select, "uk");

    expect(select.value).toBe("uk");
  });
});

describe("TextField", () => {
  const field = new TextField("#first_name", "firstName", "First name");

  it("fills an empty control from the profile", async () => {
    document.body.innerHTML = `<input id="first_name">`;

    expect(await field.fill(testProfile())).toBe(1);
    expect(input("first_name").value).toBe("Ada");
  });

  it("never overwrites a value the applicant typed", async () => {
    document.body.innerHTML = `<input id="first_name" value="Augusta">`;

    expect(await field.fill(testProfile())).toBe(0);
    expect(input("first_name").value).toBe("Augusta");
  });

  it("writes nothing when the profile value is empty", async () => {
    document.body.innerHTML = `<input id="first_name">`;
    const profile = testProfile();
    profile.personalInfo.firstName = "";

    expect(await field.fill(profile)).toBe(0);
  });

  it("does nothing, and isn't described, when the control is absent", async () => {
    expect(await field.fill(testProfile())).toBe(0);
    expect(field.describe(testProfile())).toEqual([]);
  });

  it("describes the value it would write, and edits the given profile", () => {
    document.body.innerHTML = `<input id="first_name">`;

    const [description] = field.describe(testProfile());
    expect(description).toMatchObject({
      key: "firstName",
      label: "First name",
      value: "Ada",
      editable: true,
    });

    const edited = testProfile();
    description?.update(edited, "Augusta");
    expect(edited.personalInfo.firstName).toBe("Augusta");
  });

  // Bug B4: describe() should list exactly what fill() would write, but a
  // control that already has a value (which fill() skips) is still listed.
  it.fails("doesn't describe a control that already has a value", () => {
    document.body.innerHTML = `<input id="first_name" value="Augusta">`;

    expect(field.describe(testProfile())).toEqual([]);
  });
});

describe("ResumeField", () => {
  const field = new ResumeField(
    "#resume",
    (profile) => profile.personalInfo.resume,
  );

  it("attaches the stored resume as a real file", async () => {
    document.body.innerHTML = `<input id="resume" type="file">`;
    const onChange = vi.fn();
    input("resume").addEventListener("change", onChange);

    expect(await field.fill(testProfile())).toBe(1);

    const file = input("resume").files?.[0];
    expect(file?.name).toBe("ada-lovelace-resume.pdf");
    expect(file?.type).toBe("application/pdf");
    expect(await file?.text()).toBe(TEST_RESUME_TEXT);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("leaves an already-attached file alone, and stops describing it", async () => {
    document.body.innerHTML = `<input id="resume" type="file">`;
    await field.fill(testProfile());

    expect(await field.fill(testProfile())).toBe(0);
    expect(field.describe(testProfile())).toEqual([]);
  });

  it("ignores a control that isn't a file input", async () => {
    document.body.innerHTML = `<input id="resume" type="text">`;

    expect(await field.fill(testProfile())).toBe(0);
    expect(field.describe(testProfile())).toEqual([]);
  });

  it("describes the resume read-only, by file name", () => {
    document.body.innerHTML = `<input id="resume" type="file">`;

    expect(field.describe(testProfile())).toMatchObject([
      { key: "resume", value: "ada-lovelace-resume.pdf", editable: false },
    ]);
  });
});

describe("TextQuestionField", () => {
  const field = new TextQuestionField(
    ["how did you hear", "how did you first hear"],
    "howDidYouHear",
    "How did you hear about us?",
  );

  it("fills the question whose text contains a needle", async () => {
    document.body.innerHTML = `<label for="q1">How did you hear about this job?</label><input id="q1">`;

    expect(await field.fill(testProfile())).toBe(1);
    expect(input("q1").value).toBe("Company website");
  });

  it("does nothing when no question matches", async () => {
    document.body.innerHTML = `<label for="q1">Website</label><input id="q1">`;

    expect(await field.fill(testProfile())).toBe(0);
    expect(field.describe(testProfile())).toEqual([]);
  });
});

describe("CustomQuestionsField", () => {
  const field = new CustomQuestionsField();

  function profileWith(question: string, answer: string) {
    const profile = testProfile();
    profile.customQuestions = [{ question, answer }];
    return profile;
  }

  it("fills a text question containing the stored fragment", async () => {
    document.body.innerHTML = `<label for="q1">What are your salary expectations?</label><input id="q1">`;

    expect(
      await field.fill(profileWith("salary expectations", "Negotiable")),
    ).toBe(1);
    expect(input("q1").value).toBe("Negotiable");
  });

  it("picks a native dropdown option by its label", async () => {
    document.body.innerHTML = `
      <label for="q1">Do you require sponsorship?</label>
      <select id="q1"><option value=""></option><option value="7">Yes</option><option value="8">No</option></select>`;
    const select = document.getElementById("q1") as HTMLSelectElement;

    expect(await field.fill(profileWith("require sponsorship", "No"))).toBe(1);
    expect(select.value).toBe("8");
  });

  it("never guesses when no dropdown option matches the answer", async () => {
    document.body.innerHTML = `
      <label for="q1">Do you require sponsorship?</label>
      <select id="q1"><option value=""></option><option value="7">Yes</option></select>`;
    const select = document.getElementById("q1") as HTMLSelectElement;

    expect(await field.fill(profileWith("require sponsorship", "No"))).toBe(0);
    expect(select.value).toBe("");
  });

  it("never overwrites an answered question", async () => {
    document.body.innerHTML = `<label for="q1">Salary expectations</label><input id="q1" value="100k">`;

    expect(await field.fill(profileWith("Salary expectations", "90k"))).toBe(0);
    expect(input("q1").value).toBe("100k");
  });

  it("describes only the stored questions present on the page", () => {
    document.body.innerHTML = `<label for="q1">Salary expectations</label><input id="q1">`;
    const profile = testProfile();
    profile.customQuestions = [
      { question: "Salary", answer: "90k" },
      { question: "Start date", answer: "May" },
    ];

    expect(field.describe(profile)).toMatchObject([
      { key: "custom:Salary", label: "Salary expectations", value: "90k" },
    ]);
  });
});
