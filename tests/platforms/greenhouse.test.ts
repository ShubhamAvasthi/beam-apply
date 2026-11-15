/**
 * The Greenhouse adapter run against a whole application page (the
 * fixture — see tests/helpers/fixture.ts to point it at another page).
 *
 * Assertions are written to hold for any Greenhouse application form, not
 * just the committed fixture: standard fields are required, optional ones
 * are only checked when the page has them.
 *
 * A saved page has no dropdown menus (the site renders those with
 * JavaScript while they're open), so dropdown fields are never completed
 * here — only text fields, text questions and the resume.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { greenhouseAdapter } from "@/platforms/greenhouse";
import { fixtureHas, fixtureName, mountFixture } from "../helpers/fixture";
import { TEST_RESUME_TEXT, testProfile } from "../helpers/profile";

/**
 * Runs an autofill to completion without real waiting: dropdown fields
 * poll for seconds before giving up, so timers are faked and fast-forwarded.
 */
async function autofill(profile = testProfile()): Promise<number> {
  vi.useFakeTimers();
  const result = greenhouseAdapter.autofill(profile);
  await vi.runAllTimersAsync();
  return result;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function controls(): Control[] {
  return [
    ...document.querySelectorAll<Control>(
      "input[id], textarea[id], select[id]",
    ),
  ];
}

/** Each control's current value — a file input's is its file names. */
function pageState(): Record<string, string> {
  return Object.fromEntries(
    controls().map((control) => [
      control.id,
      control instanceof HTMLInputElement && control.type === "file"
        ? [...(control.files ?? [])].map((file) => file.name).join(",")
        : control.value,
    ]),
  );
}

function valueOf(selector: string): string | undefined {
  return document.querySelector<Control>(selector)?.value;
}

describe(`Greenhouse adapter on ${fixtureName}`, () => {
  beforeEach(mountFixture);

  describe("page structure it relies on", () => {
    it.each(["#first_name", "#last_name", "#email"])(
      "renders %s as a text input",
      (selector) => {
        const element = document.querySelector(selector);
        expect(element).toBeInstanceOf(HTMLInputElement);
        expect(["text", "email"]).toContain((element as HTMLInputElement).type);
      },
    );

    // Whether a combobox is already answered is read from its react-select
    // shell; a combobox outside one would always look unanswered.
    it("renders every combobox inside a react-select control", () => {
      for (const combobox of document.querySelectorAll(
        'input[role="combobox"]',
      )) {
        expect(combobox.closest(".select__control"), combobox.id).not.toBe(
          null,
        );
      }
    });

    it.skipIf(!fixtureHas("#resume"))(
      "renders the resume upload as a file input",
      () => {
        expect(document.querySelector<HTMLInputElement>("#resume")?.type).toBe(
          "file",
        );
      },
    );
  });

  describe("describe()", () => {
    it("lists the standard fields with the profile's values", () => {
      expect(greenhouseAdapter.describe(testProfile())).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "firstName", value: "Ada" }),
          expect.objectContaining({ key: "lastName", value: "Lovelace" }),
          expect.objectContaining({ key: "email", value: "ada@example.com" }),
        ]),
      );
    });

    // The sidebar keys each row — and every edit — by this key.
    it("gives every field a distinct key", () => {
      const keys = greenhouseAdapter
        .describe(testProfile())
        .map(({ key }) => key);

      expect(new Set(keys).size).toBe(keys.length);
    });

    it("only reads the page", () => {
      const html = document.body.innerHTML;
      const state = pageState();

      greenhouseAdapter.describe(testProfile());

      expect(document.body.innerHTML).toBe(html);
      expect(pageState()).toEqual(state);
    });
  });

  describe("autofill()", () => {
    it("fills the standard fields from the profile", async () => {
      await autofill();

      expect(valueOf("#first_name")).toBe("Ada");
      expect(valueOf("#last_name")).toBe("Lovelace");
      expect(valueOf("#email")).toBe("ada@example.com");
    });

    it.skipIf(!fixtureHas("#phone"))("fills the phone number", async () => {
      await autofill();

      expect(valueOf("#phone")).toBe("+44 20 7946 0000");
    });

    it.skipIf(!fixtureHas("#resume"))("attaches the resume", async () => {
      await autofill();

      const file =
        document.querySelector<HTMLInputElement>("#resume")?.files?.[0];
      expect(file?.name).toBe("ada-lovelace-resume.pdf");
      expect(await file?.text()).toBe(TEST_RESUME_TEXT);
    });

    it("never overwrites a value the applicant typed", async () => {
      const firstName = document.querySelector<HTMLInputElement>("#first_name");
      firstName!.value = "Augusta";

      await autofill();

      expect(firstName!.value).toBe("Augusta");
    });

    // Comboboxes are excluded: with no menu to pick from, the typed search
    // text stays in the box without counting as filled. On a live page the
    // widget clears it again when focus moves on.
    it("reports exactly the number of fields it changed", async () => {
      const comboboxes = new Set(
        [...document.querySelectorAll('input[role="combobox"]')].map(
          ({ id }) => id,
        ),
      );
      const before = pageState();

      const filled = await autofill();

      const after = pageState();
      const changed = Object.keys(after).filter(
        (id) => !comboboxes.has(id) && after[id] !== before[id],
      );
      expect(filled).toBe(changed.length);
      expect(filled).toBeGreaterThan(0);
    });

    it("writes nothing on a second run", async () => {
      await autofill();
      const state = pageState();

      expect(await autofill()).toBe(0);
      expect(pageState()).toEqual(state);
    });
  });
});
