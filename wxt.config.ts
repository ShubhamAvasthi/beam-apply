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
        // Fixed, product-owned ID for AMO (required). Encodes a domain we
        // control — beamapply.com must stay renewed for as long as the
        // extension exists. Do NOT change this after the first AMO
        // submission: a new ID is treated as a different add-on.
        id: 'beamapply@beamapply.com',
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
