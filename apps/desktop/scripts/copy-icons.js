/**
 * Copies only the icons we need from simple-icons and lucide-static
 * into public/icons/ for use as static assets in the Vite renderer.
 *
 * Brand icons get their official color injected as fill attribute.
 * Lucide icons use currentColor (inherited from CSS).
 */

const fs = require('fs');
const path = require('path');

/** Walk up from resolved entry point to find the package root (contains package.json). */
function packageRoot(pkg) {
  let dir = path.dirname(require.resolve(pkg));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot find package root for ${pkg}`);
    dir = parent;
  }
  return dir;
}

const OUT = path.join(__dirname, '..', 'public', 'icons');
const SI = path.join(packageRoot('simple-icons'), 'icons');
const LU = path.join(packageRoot('lucide-static'), 'icons');

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
  'user',
  'crown',
  'brain',
  'search',
  'trash-2',
  'edit-3',
  'chevron-left',
  'chevron-right',
  'message-square',
  'lightbulb',
  'calendar',
  'link',
  'database',
  'share-2',
];

for (const name of lucideIcons) {
  const src = path.join(LU, `${name}.svg`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(OUT, `${name}.svg`));
  } else {
    console.warn(`lucide icon not found: ${name}`);
  }
}

/* ── Integration brand icons from simple-icons ── */
const INTEGRATIONS_OUT = path.join(OUT, 'integrations');
fs.mkdirSync(INTEGRATIONS_OUT, { recursive: true });

const integrationBrands = {
  notion: { file: 'notion.svg', color: '#FFFFFF' },
  github: { file: 'github.svg', color: '#FFFFFF' },
  linear: { file: 'linear.svg', color: '#5E6AD2' },
  slack: null, // reuse existing slack icon (multi-color)
  googledrive: null, // multi-color, custom SVG below
  jira: { file: 'jira.svg', color: '#2684FF' },
  trello: { file: 'trello.svg', color: '#0079BF' },
  asana: { file: 'asana.svg', color: '#F06A6A' },
  confluence: { file: 'confluence.svg', color: '#2684FF' },
  sentry: { file: 'sentry.svg', color: '#FB4226' },
  postgresql: { file: 'postgresql.svg', color: '#4169E1' },
  googlecalendar: null, // multi-color, custom SVG below
  figma: null, // multi-color, custom SVG below
  hubspot: { file: 'hubspot.svg', color: '#FF7A59' },
  stripe: { file: 'stripe.svg', color: '#635BFF' },
  telegram: { file: 'telegram.svg', color: '#26A5E4' },
};

let integrationCount = 0;
for (const [name, brand] of Object.entries(integrationBrands)) {
  if (!brand) {
    // Copy from main icons dir
    const mainIcon = path.join(OUT, `${name}.svg`);
    if (fs.existsSync(mainIcon)) {
      fs.copyFileSync(mainIcon, path.join(INTEGRATIONS_OUT, `${name}.svg`));
      integrationCount++;
    }
    continue;
  }
  const src = path.join(SI, brand.file);
  if (!fs.existsSync(src)) {
    console.warn(`simple-icons not found: ${brand.file}`);
    continue;
  }
  let svg = fs.readFileSync(src, 'utf8');
  if (!svg.includes('fill=')) {
    svg = svg.replace('<svg', `<svg fill="${brand.color}"`);
  } else {
    svg = svg.replace(/fill="[^"]*"/, `fill="${brand.color}"`);
  }
  fs.writeFileSync(path.join(INTEGRATIONS_OUT, `${name}.svg`), svg);
  integrationCount++;
}

/* ── Multi-color integration icons (not in simple-icons) ── */

const figmaSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M5.5 4.5C5.5 2.567 7.067 1 9 1h3v7H9C7.067 8 5.5 6.433 5.5 4.5z" fill="#F24E1E"/>
<path d="M12 1h3c1.933 0 3.5 1.567 3.5 3.5S16.933 8 15 8h-3V1z" fill="#FF7262"/>
<path d="M5.5 12c0-1.933 1.567-3.5 3.5-3.5h3v7H9c-1.933 0-3.5-1.567-3.5-3.5z" fill="#A259FF"/>
<path d="M5.5 19.5C5.5 17.567 7.067 16 9 16h3v3.5c0 1.933-1.567 3.5-3.5 3.5S5.5 21.433 5.5 19.5z" fill="#0ACF83"/>
<path d="M12 8.5h3c1.933 0 3.5 1.567 3.5 3.5s-1.567 3.5-3.5 3.5h-3v-7z" fill="#1ABCFE"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'figma.svg'), figmaSvg);
integrationCount++;

const googleDriveSvg = `<svg viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg">
<path d="M8 0l8 0 8 14h-8z" fill="#FFBA00"/>
<path d="M0 14l4 7h16l4-7z" fill="#4285F4"/>
<path d="M8 0L0 14l4 7L16 0z" fill="#0F9D58"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'googledrive.svg'), googleDriveSvg);
integrationCount++;

const googleCalendarSvg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="c"><rect width="200" height="200" rx="32"/></clipPath></defs>
<g clip-path="url(#c)">
<rect width="200" height="200" fill="#4285F4"/>
<rect x="140" y="0" width="60" height="40" fill="#EA4335"/>
<rect x="0" y="160" width="140" height="40" fill="#34A853"/>
<rect x="140" y="160" width="60" height="40" fill="#FBBC04"/>
<rect x="40" y="40" width="100" height="120" fill="#FFF"/>
<text x="90" y="122" text-anchor="middle" font-family="Google Sans,Product Sans,Roboto,Arial,sans-serif" font-size="80" font-weight="400" fill="#1A73E8">31</text>
</g>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'googlecalendar.svg'), googleCalendarSvg);
integrationCount++;

/* Also add the plug icon for palette command */
const plugSrc = path.join(LU, 'plug.svg');
if (fs.existsSync(plugSrc)) {
  fs.copyFileSync(plugSrc, path.join(OUT, 'plug.svg'));
}

console.log(
  `Copied ${Object.keys(brands).length + 2} brand icons, ${lucideIcons.length} UI icons, and ${integrationCount} integration icons to ${OUT}`,
);
