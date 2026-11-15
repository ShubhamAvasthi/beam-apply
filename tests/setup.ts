import { afterEach, beforeEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

beforeEach(() => {
  // Each test starts with empty extension storage and no listeners.
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
