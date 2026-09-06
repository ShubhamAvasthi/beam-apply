import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  browser: 'firefox',
  // AMO requires MV3 for new submissions; override Firefox's MV2 default.
  manifestVersion: 3,
  manifest: (env) => ({
    name: 'BeamApply',
    description: 'A fast, deterministic, privacy-first browser extension for autofilling job applications.',
    // Firefox's recommended way to identify the developer (MDN: name/url
    // override the `author` and `homepage_url` keys). Absent from WXT's
    // Chrome-derived Manifest type, but config accepts untyped keys.
    developer: { name: 'BeamApply', url: 'https://beamapply.com' },
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
        // The data-collection key only exists in Firefox 140+ — web-ext lint
        // requires the declared minimum to be >= the oldest engine that can
        // parse every manifest key we ship. 140 is also the current ESR line.
        strict_min_version: '140.0',
      },
      // Firefox for Android gained the data-collection key in 142; desktop
      // stays on the 140 ESR.
      gecko_android: {
        strict_min_version: '142.0',
      },
    },
    icons:
      // Chrome's manifest parser does not support SVG icons — its build
      // references PNGs rasterized by scripts/generate-icons.ts. Firefox
      // supports SVG natively, so its build keeps the vector sources.
      env.browser === 'chrome'
        ? {
            16: '/icon/icon-16.png',
            32: '/icon/icon-32.png',
            48: '/icon/icon-48.png',
            128: '/icon/icon-128.png',
          }
        : {
            16: '/icon/logo-only.svg',
            32: '/icon/logo-only.svg',
            48: '/icon/logo-only.svg',
            96: '/icon/logo-full.svg',
            128: '/icon/logo-full.svg',
          },
  }),
});
