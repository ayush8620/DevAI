// Regenerates the PNG brand assets (and devai-og.svg) from the hand-written SVGs in packages/dashboard/public/brand.
// Usage: node scripts/brand-assets.mjs [preview.png]   (needs `sharp`, already installed with Next.js)
// Logo: "loop-route D" (E9) - outlined rounded tile, D-shaped route that loops back to an orange dot.
// Path is black on light backgrounds (devai-mark.svg) and white on dark (devai-mark-inverted.svg).
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dash = path.join(root, 'packages/dashboard');
const brand = path.join(dash, 'public/brand');
const mark = readFileSync(path.join(brand, 'devai-mark.svg'), 'utf8');
const markInv = readFileSync(path.join(brand, 'devai-mark-inverted.svg'), 'utf8');
// Favicon cut (filled white tile, heavier strokes for 16 px); src/app/icon.svg is hand-written too.
const small = readFileSync(path.join(dash, 'src/app/icon.svg'), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/<!--[\s\S]*?-->/g, '');
const png = (svg, w, h, out) => sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png().toFile(out);
const ORANGE = '#F97316';
const ROUTE = 'M16 46V18H31C41 18 47 25 47 32 47 39 41 46 31 46H29C22.5 46 22.5 32 29 32H33';

// Apple touch icon and manifest icons: solid white, full bleed (iOS / Android round it), no tile outline.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#FFFFFF"/><g transform="translate(6.4 6.4) scale(0.8)"><path d="${ROUTE}" fill="none" stroke="#0A0A0A" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36.5" cy="32" r="4.8" fill="${ORANGE}"/><circle cx="16" cy="46" r="4.8" fill="#0A0A0A"/></g></svg>`;

await png(small, 32, 32, path.join(dash, 'src/app/icon1.png'));
await png(apple, 180, 180, path.join(dash, 'src/app/apple-icon.png'));
await png(mark, 512, 512, path.join(brand, 'devai-mark-512.png'));
// Web app manifest icons (src/app/manifest.ts): same solid white tile, safe for "maskable" (mark inside the 80% safe zone)
await png(apple, 192, 192, path.join(brand, 'devai-icon-192.png'));
await png(apple, 512, 512, path.join(brand, 'devai-icon-512.png'));

const markAt = (x, y, size, svg = mark) => `<g transform="translate(${x} ${y}) scale(${size / 64})">${inner(svg)}</g>`;
const FONT = `Inter, 'Segoe UI', Helvetica, Arial, sans-serif`;
const word = (x, y, size, color) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.03}"><tspan fill="${color}">Dev</tspan><tspan fill="${ORANGE}">AI</tspan></text>`;

// Open Graph / Twitter image, 1200 x 630, dark background with the inverted mark
const chips = ['OpenAI', 'Anthropic', 'Gemini', 'Groq', 'OpenRouter', 'Mistral'];
let cx = 96;
const chipSvg = chips.map(c => {
  const w = 28 + c.length * 13.5;
  const s = `<g transform="translate(${cx} 452)"><rect width="${w}" height="44" rx="22" fill="#111111" stroke="#262626"/><text x="${w / 2}" y="29" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="500" fill="#D4D4D4">${c}</text></g>`;
  cx += w + 12;
  return s;
}).join('');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.85" cy="0" r="0.7"><stop offset="0" stop-color="${ORANGE}" stop-opacity="0.22"/><stop offset="1" stop-color="#0A0A0A" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#1F1F1F" stroke-width="1"/></pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0A0A" stop-opacity="0"/><stop offset="1" stop-color="#0A0A0A"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0A0A0A"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.7"/>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  ${markAt(96, 96, 112, markInv)}
  ${word(236, 184, 88, '#FAFAFA')}
  <text x="96" y="318" font-family="${FONT}" font-size="54" font-weight="700" fill="#FAFAFA" letter-spacing="-1.5">One OpenAI-compatible endpoint.</text>
  <text x="96" y="384" font-family="${FONT}" font-size="54" font-weight="700" fill="${ORANGE}" letter-spacing="-1.5">Your own keys.</text>
  ${chipSvg}
  <text x="96" y="566" font-family="${FONT}" font-size="22" fill="#A3A3A3">Failover · key rotation · streaming · usage analytics</text>
  <text x="1104" y="566" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="600" fill="#FB923C">devai-dashboard-six.vercel.app</text>
</svg>`;
writeFileSync(path.join(brand, 'devai-og.svg'), og);
await png(og, 1200, 630, path.join(dash, 'src/app/opengraph-image.png'));
await png(og, 1200, 630, path.join(dash, 'src/app/twitter-image.png'));

// Preview sheet (not shipped): marks, favicon sizes and full logo on dark and light
if (process.argv[2]) {
  const half = (y, bg, txt, sub, m) => `
    <rect y="${y}" width="1600" height="450" fill="${bg}"/>
    <text x="80" y="${y + 70}" font-family="${FONT}" font-size="22" font-weight="600" fill="${sub}" letter-spacing="3">${bg === '#FFFFFF' ? 'LIGHT' : 'DARK'}</text>
    ${markAt(80, y + 130, 192, m)}
    ${markAt(312, y + 226, 64, m)}
    ${markAt(400, y + 242, 32, small)}
    ${markAt(448, y + 250, 16, small)}
    ${markAt(600, y + 162, 128, m)}
    ${word(752, y + 268, 112, txt)}`;
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    ${half(0, '#0A0A0A', '#FAFAFA', '#737373', markInv)}${half(450, '#FFFFFF', '#0F172A', '#A3A3A3', mark)}</svg>`;
  await png(sheet, 1600, 900, process.argv[2]);
}
console.log('brand assets written');
