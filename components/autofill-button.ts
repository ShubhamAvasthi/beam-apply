import buttonStyle from './autofill-button.css?raw';

import { browser } from 'wxt/browser';

import { findAdapter } from '@/platforms';
import { getMissingProfileFields } from '@/types/profile';
import { profileStorage } from '@/utils/storage';

const HOST_ID = 'beamapply-autofill-host';
const BUTTON_LABEL = '⚡ Autofill';
const FILLED_LABEL = '✓ Filled';
const INCOMPLETE_LABEL = '⚠ Complete profile';

/**
 * Fully isolated inside a shadow root so neither the host page’s CSS nor
 * ours leak across — the same technique Greenhouse’s own toast uses.
 *
 * Mounted on <body> with position:fixed: framework-managed containers
 * prune unknown children during reconciliation, and inline placement is
 * subject to every ancestor’s CSS. A body-level floating node sidesteps
 * both problems.
 */

/**
 * Mounts the floating BeamApply autofill button on the page body.
 *
 * Clicking loads the stored profile and fills the fields through
 * whichever platform adapter covers the current host — safe at any
 * moment, because a human click is always post-initialization.
 */
export function mountAutofillButton(): void {
  if (document.getElementById(HOST_ID) !== null) return;

  const mountTarget = document.body ?? document.documentElement;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = buttonStyle;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = BUTTON_LABEL;
  button.addEventListener('click', () => {
    void fillFromProfile(button);
  });

  shadowRoot.append(style, button);
  mountTarget.appendChild(host);
}

/**
 * Opens the BeamApply options/profile editor.
 *
 * Firefox content scripts may call `runtime.openOptionsPage()`; other
 * browsers only expose it to extension contexts. Fall back to opening the
 * options URL in a new tab — `open_in_tab` is set, so it's the same page.
 */
function openOptionsPage(): void {
  const opener = browser.runtime.openOptionsPage;
  if (typeof opener === 'function') {
    Promise.resolve(opener()).catch(() => {
      window.open(browser.runtime.getURL('/options.html'), '_blank');
    });
  } else {
    window.open(browser.runtime.getURL('/options.html'), '_blank');
  }
}

async function fillFromProfile(button: HTMLButtonElement): Promise<void> {
  const adapter = findAdapter(window.location.hostname);
  if (!adapter) return;

  const profile = await profileStorage.getValue();

  // Schema guard: every required field must be present before we touch the
  // form. A required field added to EMPTY_PROFILE flags older stored
  // profiles here, forcing the user to fix the profile instead of silently
  // half-filling the application. The button keeps the warning label, and
  // clicking it opens the profile editor until the profile is complete.
  const missing = getMissingProfileFields(profile);
  if (missing.length > 0) {
    console.warn(
      `[BeamApply] profile is incomplete; missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Open the profile editor to fix it.`,
    );
    button.textContent = INCOMPLETE_LABEL;
    openOptionsPage();
    return;
  }

  const filledCount = await adapter.autofill(profile);
  if (filledCount > 0) {
    button.disabled = true;
    button.textContent = FILLED_LABEL;
  }
}