// Erzeugt die PNG-Icons aus einer SVG-Vorlage (benötigt Playwright, nur für die Entwicklung).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const glyph = `
  <path d="M96 168a24 24 0 0 1 24-24h88l32 36h152a24 24 0 0 1 24 24v152a24 24 0 0 1-24 24H120a24 24 0 0 1-24-24z" fill="#fff"/>
  <path d="M184 232h144a16 16 0 0 1 16 16v64a16 16 0 0 1-16 16h-84l-36 28v-28h-24a16 16 0 0 1-16-16v-64a16 16 0 0 1 16-16z" fill="url(#g)"/>
  <circle cx="214" cy="280" r="9" fill="#fff"/><circle cx="256" cy="280" r="9" fill="#fff"/><circle cx="298" cy="280" r="9" fill="#fff"/>`;
const svg = (size, { rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A3A6B"/><stop offset="1" stop-color="#17748C"/></linearGradient></defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#g)"/>
  <g transform="translate(${256 - 256 * scale} ${256 - 256 * scale}) scale(${scale})">${glyph}</g></svg>`;
const jobs = [
  ['icons/icon-192.png', 192, { rounded: true, scale: 1 }, true],
  ['icons/icon-512.png', 512, { rounded: true, scale: 1 }, true],
  ['icons/icon-maskable-512.png', 512, { rounded: false, scale: 0.78 }, false],
  ['icons/apple-touch-icon.png', 180, { rounded: false, scale: 1 }, false],
];
mkdirSync('icons', { recursive: true });
const b = await chromium.launch();
for (const [file, size, opts, transparent] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:transparent">${svg(size, opts)}</body>`);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
}
await b.close();
