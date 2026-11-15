import { browser } from "wxt/browser";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === "OPEN_OPTIONS_PAGE"
    ) {
      void browser.runtime.openOptionsPage();
    }
  });
});
