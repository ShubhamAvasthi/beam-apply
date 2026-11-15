import { describe, expect, it } from "vitest";
import { findAdapter } from "@/platforms";

describe("findAdapter", () => {
  it.each([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "eu.job-boards.greenhouse.io",
  ])("picks the Greenhouse adapter for %s", (hostname) => {
    expect(findAdapter(hostname)?.id).toBe("greenhouse");
  });

  it.each([
    "greenhouse.io",
    "example.com",
    // Look-alike hosts must not match on a bare suffix or prefix.
    "fakeboards.greenhouse.io.example.com",
    "notboards.greenhouse.io",
  ])("finds no adapter for %s", (hostname) => {
    expect(findAdapter(hostname)).toBeUndefined();
  });
});
