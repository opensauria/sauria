/**
 * Copies only the icons we need from simple-icons and lucide-static
 * into src/ui/icons/ for use in the Electron renderer.
 *
 * Brand icons get their official color injected as fill attribute.
 * Lucide icons use currentColor (inherited from CSS).
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'ui', 'icons');
const SI = path.join(__dirname, '..', 'node_modules', 'simple-icons', 'icons');
const LU = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');

fs.mkdirSync(OUT, { recursive: true });

/* ── Brand icons from simple-icons ──────────── */
const brands = {
  telegram: { file: 'telegram.svg', color: '#26A5E4' },
  discord: { file: 'discord.svg', color: '#5865F2' },
  whatsapp: { file: 'whatsapp.svg', color: '#25D366' },
  gmail: { file: 'gmail.svg', color: '#EA4335' },
};

for (const [name, { file, color }] of Object.entries(brands)) {
  const src = path.join(SI, file);
  let svg = fs.readFileSync(src, 'utf8');
  /* Inject fill color if not present */
  if (!svg.includes('fill=')) {
    svg = svg.replace('<svg', `<svg fill="${color}"`);
  } else {
    svg = svg.replace(/fill="[^"]*"/, `fill="${color}"`);
  }
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
}

/* Slack is not in simple-icons — ship a local copy */
const slackSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
<path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
<path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
<path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E"/>
</svg>`;
fs.writeFileSync(path.join(OUT, 'slack.svg'), slackSvg);

/* Generic email icon (lucide mail) */
const emailSrc = path.join(LU, 'mail.svg');
fs.copyFileSync(emailSrc, path.join(OUT, 'email.svg'));

/* ── UI icons from lucide-static ────────────── */
const lucideIcons = [
  'settings',
  'zoom-in',
  'zoom-out',
  'maximize',
  'plus',
  'x',
  'square-plus',
  'chevron-down',
  'chevron-up',
  'unlink',
  'crown',
];

for (const name of lucideIcons) {
  const src = path.join(LU, `${name}.svg`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUT, `${name}.svg`));
  } else {
    console.warn(`lucide icon not found: ${name}`);
  }
}

console.log(`Copied ${Object.keys(brands).length + 2} brand icons and ${lucideIcons.length} UI icons to ${OUT}`);
