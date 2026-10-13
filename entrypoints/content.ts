import { mountAutofillButton } from "@/components/autofill-button";
import { mountSidebar } from "@/components/sidebar";

export default defineContentScript({
  matches: [
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
  ],
  allFrames: true,
  main() {
    // The top frame gets the full sidebar; sub-frames (an embedded board)
    // only get the pill, since a full-height panel in an iframe is noise.
    mountSidebar();
    if (window !== window.top) mountAutofillButton();
  },
});
