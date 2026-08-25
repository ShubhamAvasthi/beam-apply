import buttonStyle from './autofill-button.css?raw';

import { findAdapter } from '@/platforms';
import { profileStorage } from '@/utils/storage';

const HOST_ID = 'beamapply-autofill-host';
const BUTTON_LABEL = '⚡ Autofill';
const FILLED_LABEL = '✓ Filled';

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

async function fillFromProfile(button: HTMLButtonElement): Promise<void> {
  const adapter = findAdapter(window.location.hostname);
  if (!adapter) return;

  const profile = await profileStorage.getValue();
  const filledCount = adapter.autofill(profile);
  if (filledCount > 0) {
    button.disabled = true;
    button.textContent = FILLED_LABEL;
  }
}