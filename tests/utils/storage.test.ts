import { describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "@/types/profile";
import { DEV_TEST_PROFILE } from "@/utils/dev-profile";
import { testProfile } from "../helpers/profile";

/**
 * A freshly loaded storage module. The fallback profile is built once, when
 * the module loads — so tests that change the build flag, or mutate the
 * fallback, each need their own copy.
 */
async function loadProfileStorage() {
  vi.resetModules();
  const { profileStorage } = await import("@/utils/storage");
  return profileStorage;
}

describe("profileStorage", () => {
  it("falls back to the dev profile in development builds", async () => {
    const profileStorage = await loadProfileStorage();

    expect(await profileStorage.getValue()).toEqual(DEV_TEST_PROFILE);
  });

  it("falls back to an empty profile in production builds", async () => {
    vi.stubEnv("DEV", false);
    const profileStorage = await loadProfileStorage();

    expect(await profileStorage.getValue()).toEqual(createEmptyProfile());
  });

  it("returns the saved profile once one exists", async () => {
    const profileStorage = await loadProfileStorage();
    await profileStorage.setValue(testProfile());

    expect(await profileStorage.getValue()).toEqual(testProfile());
  });

  // Bug B1: WXT hands out the same fallback object on every read, so an
  // edit to one read (the sidebar's working copy) leaks into the next —
  // which is also what "Reset edits" reads.
  it.fails("gives every read of the fallback its own copy", async () => {
    const profileStorage = await loadProfileStorage();
    const first = await profileStorage.getValue();
    first.personalInfo.firstName = "edited";

    const second = await profileStorage.getValue();
    expect(second.personalInfo.firstName).toBe(
      DEV_TEST_PROFILE.personalInfo.firstName,
    );
  });
});
