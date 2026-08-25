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
const BUTTON_STYLE = `
  :host {
    all: initial;
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
  }
  button {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 12px 18px;
    font: 600 14px/1 Inter, system-ui, sans-serif;
    color: #ffffff; background-color: #646cff;
    border: none; border-radius: 999px; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    transition: background-color 0.2s;
  }
  button:hover:not(:disabled) { background-color: #535bf2; }
  button:disabled { opacity: 0.85; cursor: default; }
`;

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
  style.textContent = BUTTON_STYLE;
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