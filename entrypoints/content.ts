import { mountAutofillButton } from '@/components/autofill-button';

export default defineContentScript({
  matches: [
    'https://boards.greenhouse.io/*',
    'https://job-boards.greenhouse.io/*',
  ],
  allFrames: true,
  main() {
    mountAutofillButton();
  },
});
