// Regenerates the PNG brand assets from the hand-written SVGs in packages/dashboard/public/brand.
// Usage: node scripts/brand-assets.mjs   (needs `sharp`, already installed with Next.js)
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dash = path.join(root, 'packages/dashboard');
const brand = path.join(dash, 'public/brand');
const mark = readFileSync(path.join(brand, 'devai-mark.svg'), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');
const png = (svg, w, h, out) => sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png().toFile(out);

// Favicons: 32 px PNG (src/app/icon1.png) and 180 px Apple touch icon (src/app/apple-icon.png, full bleed, iOS rounds it)
await png(mark, 32, 32, path.join(dash, 'src/app/icon1.png'));
await png(mark.replace('rx="16"', 'rx="0"'), 180, 180, path.join(dash, 'src/app/apple-icon.png'));
await png(mark, 512, 512, path.join(brand, 'devai-mark-512.png'));

const markAt = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})">${inner(mark).replaceAll('devai-g', id)}</g>`;
const FONT = `Inter, 'Segoe UI', Helvetica, Arial, sans-serif`;
const word = (x, y, size, color, id) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.03}"><tspan fill="${color}">Dev</tspan><tspan fill="url(#${id})">AI</tspan></text>`;
const textGrad = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>`;

// Open Graph image, 1200 x 630
const chips = ['OpenAI', 'Anthropic', 'Gemini', 'Groq', 'OpenRouter', 'Mistral'];
let cx = 96;
const chipSvg = chips.map(c => {
  const w = 28 + c.length * 13.5;
  const s = `<g transform="translate(${cx} 452)"><rect width="${w}" height="44" rx="22" fill="#0F172A" stroke="#1E293B"/><text x="${w / 2}" y="29" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="500" fill="#CBD5E1">${c}</text></g>`;
  cx += w + 12;
  return s;
}).join('');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.75"><stop offset="0" stop-color="#2563EB" stop-opacity="0.45"/><stop offset="1" stop-color="#020617" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#1E293B" stroke-width="1"/></pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020617" stop-opacity="0"/><stop offset="1" stop-color="#020617"/></linearGradient>
    ${textGrad('ogt')}
  </defs>
  <rect width="1200" height="630" fill="#020617"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.6"/>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  ${markAt(96, 96, 112, 'ogm')}
  ${word(236, 184, 88, '#F8FAFC', 'ogt')}
  <text x="96" y="318" font-family="${FONT}" font-size="54" font-weight="700" fill="#F8FAFC" letter-spacing="-1.5">One OpenAI-compatible endpoint.</text>
  <text x="96" y="384" font-family="${FONT}" font-size="54" font-weight="700" fill="url(#ogt)" letter-spacing="-1.5">Your own keys.</text>
  ${chipSvg}
  <text x="96" y="566" font-family="${FONT}" font-size="22" fill="#94A3B8">Failover · key rotation · streaming · usage analytics</text>
  <text x="1104" y="566" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="600" fill="#60A5FA">devai-dashboard-six.vercel.app</text>
</svg>`;
writeFileSync(path.join(brand, 'devai-og.svg'), og);
await png(og, 1200, 630, path.join(dash, 'src/app/opengraph-image.png'));
await png(og, 1200, 630, path.join(dash, 'src/app/twitter-image.png'));

// Preview sheet (not shipped): mark + full logo on dark and light
if (process.argv[2]) {
  const half = (y, bg, txt, sub, id) => `
    <rect y="${y}" width="1600" height="450" fill="${bg}"/>
    <text x="80" y="${y + 70}" font-family="${FONT}" font-size="22" font-weight="600" fill="${sub}" letter-spacing="3">${bg === '#FFFFFF' ? 'LIGHT' : 'DARK'}</text>
    ${markAt(80, y + 130, 192, id + 'm1')}
    ${markAt(312, y + 226, 64, id + 'm2')}
    ${markAt(400, y + 242, 32, id + 'm3')}
    ${markAt(448, y + 250, 16, id + 'm4')}
    ${markAt(600, y + 162, 128, id + 'm5')}
    ${word(752, y + 268, 112, txt, id + 't')}`;
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs>${textGrad('dkt')}${textGrad('ltt')}</defs>
    ${half(0, '#020617', '#F8FAFC', '#64748B', 'dk')}${half(450, '#FFFFFF', '#0F172A', '#94A3B8', 'lt')}</svg>`;
  await png(sheet, 1600, 900, process.argv[2]);
}
console.log('brand assets written');
