import '@picocss/pico/css/pico.min.css';

import { browser } from 'wxt/browser';

// Entry point: open the full profile editor when the button is clicked.
const editProfile = document.querySelector<HTMLButtonElement>('#edit-profile')!;

editProfile.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
});
