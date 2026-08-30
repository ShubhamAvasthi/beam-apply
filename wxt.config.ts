import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  browser: 'firefox',
  manifest: {
    name: 'BeamApply',
    description: 'One-click autofill for job applications. Local-first, no accounts.',
    version: '1.0.0',
    permissions: ['storage', 'unlimitedStorage'],
    browser_specific_settings: {
      gecko: {
        // Fixed ID for AMO (required; ties to your GitHub identity).
        // Do NOT ship a random GUID here — it can't be rotated on resubmit.
        // Provisional example you might use elsewhere:
        //   {3a19d239-c143-484a-93c8-4b45274d2a52}
        id: 'beamapply-autofill@shubhamavasthi.github.io',
        // Firefox/AMO requires an explicit data-collection declaration for
        // all new extensions (policy since Nov 3, 2025). BeamApply sends
        // nothing off-device, so declare the minimum explicitly to prevent
        // future permission drift from breaking review.
        data_collection_permissions: { required: ['none'] },
      },
      // Optional: set a minimum engine version if a specific fix is required.
      // strict_min_version: '120.0',
    },
    icons: {
      16: '/icon/logo-only.svg',
      32: '/icon/logo-only.svg',
      48: '/icon/logo-only.svg',
      96: '/icon/logo-full.svg',
      128: '/icon/logo-full.svg',
    },
  },
});
