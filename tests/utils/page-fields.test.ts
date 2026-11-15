import { describe, expect, it } from "vitest";
import {
  collectPageFields,
  findQuestion,
  matchProfileKey,
  type PageField,
} from "@/utils/page-fields";

/** One labelled control, the way application forms render questions. */
function question(label: string, control: string): string {
  const id = /id="([^"]+)"/.exec(control)?.[1];
  return `<label for="${id}">${label}</label>${control}`;
}

describe("collectPageFields", () => {
  it("classifies each kind of labelled control", () => {
    document.body.innerHTML = [
      question("Name", `<input id="a" type="text">`),
      question("Email", `<input id="b" type="email">`),
      question("Phone", `<input id="c" type="tel">`),
      question("Site", `<input id="d" type="url">`),
      question("Years", `<input id="e" type="number">`),
      question("About", `<textarea id="f"></textarea>`),
      question("Size", `<select id="g"><option>S</option></select>`),
      question("Country", `<input id="h" type="text" role="combobox">`),
    ].join("");

    expect(
      collectPageFields().map(({ text, kind }) => ({ text, kind })),
    ).toEqual([
      { text: "Name", kind: "text" },
      { text: "Email", kind: "text" },
      { text: "Phone", kind: "text" },
      { text: "Site", kind: "text" },
      { text: "Years", kind: "text" },
      { text: "About", kind: "text" },
      { text: "Size", kind: "select" },
      { text: "Country", kind: "combobox" },
    ]);
  });

  it("skips checkboxes, radios, file inputs and dangling labels", () => {
    document.body.innerHTML = [
      question("Agree", `<input id="a" type="checkbox">`),
      question("Choice", `<input id="b" type="radio">`),
      question("Resume", `<input id="c" type="file">`),
      `<label for="nowhere">Orphan</label>`,
    ].join("");

    expect(collectPageFields()).toEqual([]);
  });

  it("falls back to the control's aria-label when the label is empty", () => {
    document.body.innerHTML = question(
      "",
      `<input id="a" type="text" aria-label="Portfolio URL">`,
    );

    expect(collectPageFields()[0]?.text).toBe("Portfolio URL");
  });

  it("references the live control and its current value", () => {
    document.body.innerHTML = question("Name", `<input id="a" value="Ada">`);

    const [field] = collectPageFields();
    expect(field?.control).toBe(document.getElementById("a"));
    expect(field?.value).toBe("Ada");
  });
});

describe("findQuestion", () => {
  function pageFields(html: string): PageField[] {
    document.body.innerHTML = html;
    return collectPageFields();
  }

  it("matches needles case-insensitively against the question text", () => {
    const fields = pageFields(
      question("Your LinkedIn Profile URL", `<input id="a">`),
    );

    expect(findQuestion(fields, ["linkedin profile"], "text")?.control).toBe(
      document.getElementById("a"),
    );
  });

  it("tries needles in order", () => {
    const fields = pageFields(
      question("How did you first hear about us?", `<input id="a">`) +
        question("How did you hear about this role?", `<input id="b">`),
    );

    expect(
      findQuestion(
        fields,
        ["how did you first hear", "how did you hear"],
        "text",
      )?.control.id,
    ).toBe("a");
  });

  it("returns undefined when only a different kind matches", () => {
    const fields = pageFields(
      question("Willing to relocate?", `<select id="a"></select>`),
    );

    expect(findQuestion(fields, ["relocate"], "text")).toBeUndefined();
  });

  // Bug B2: the first question containing the needle is checked for kind
  // and, if it's the wrong kind, every later question is ignored.
  it.fails("finds a later match of the requested kind", () => {
    const fields = pageFields(
      question("LinkedIn profile (select one)", `<select id="a"></select>`) +
        question("LinkedIn profile URL", `<input id="b">`),
    );

    expect(findQuestion(fields, ["linkedin profile"], "text")?.control.id).toBe(
      "b",
    );
  });
});

describe("matchProfileKey", () => {
  it.each([
    ["First Name", "firstName"],
    ["Work email address", "email"],
    ["Phone number", "phone"],
    ["LinkedIn Profile", "linkedIn"],
    ["Are you willing to relocate?", "willingToRelocate"],
    ["Favourite colour", undefined],
  ])("maps %j to %j", (text, key) => {
    expect(matchProfileKey({ text } as PageField)).toBe(key);
  });
});
