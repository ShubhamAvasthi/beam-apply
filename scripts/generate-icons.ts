/**
 * Rasterizes the manifest icons for the Chrome build (Chrome does not
 * support SVG icons; Firefox does, so it keeps the SVGs — see
 * wxt.config.ts).
 *
 * Usage: bun scripts/generate-icons.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** Mirrors the Firefox icon mapping in wxt.config.ts. */
const SIZES: Array<{ size: number; source: 'logo-only' | 'logo-full' }> = [
  { size: 16, source: 'logo-only' },
  { size: 32, source: 'logo-only' },
  { size: 48, source: 'logo-only' },
  { size: 128, source: 'logo-full' },
];

const iconDir = fileURLToPath(new URL('../public/icon', import.meta.url));
await mkdir(iconDir, { recursive: true });

for (const { size, source } of SIZES) {
  const svg = await readFile(path.join(iconDir, `${source}.svg`));
  // High density renders the 512-unit viewBox at ~4x before downscaling,
  // so small sizes stay crisp.
  const png = await sharp(svg, { density: 288 })
    .resize(size, size)
    .png()
    .toBuffer();
  const out = path.join(iconDir, `icon-${size}.png`);
  await writeFile(out, png);
  console.log(`icon-${size}.png  (${png.length} bytes)  <- ${source}.svg`);
}
