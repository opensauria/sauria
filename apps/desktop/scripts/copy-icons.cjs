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
  'clock',
  'clipboard-list',
  'heart-pulse',
  'book-open',
  'power',
  'globe',
  'refresh-cw',
  'sparkles',
  'lock',
  'lock-open',
  'check',
  'code-xml',
  'terminal',
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
  // Communication
  slack: null,
  discord: { file: 'discord.svg', color: '#5865F2' },
  gmail: null,
  email: null,
  // Project Management
  linear: { file: 'linear.svg', color: '#5E6AD2' },
  jira: { file: 'jira.svg', color: '#2684FF' },
  trello: { file: 'trello.svg', color: '#0079BF' },
  asana: { file: 'asana.svg', color: '#F06A6A' },
  clickup: { file: 'clickup.svg', color: '#7B68EE' },
  todoist: { file: 'todoist.svg', color: '#E44332' },
  monday: null,
  basecamp: { file: 'basecamp.svg', color: '#1D2D35' },
  // Development
  github: { file: 'github.svg', color: '#FFFFFF' },
  gitlab: { file: 'gitlab.svg', color: '#FC6D26' },
  bitbucket: { file: 'bitbucket.svg', color: '#0052CC' },
  circleci: { file: 'circleci.svg', color: '#343434' },
  vercel: { file: 'vercel.svg', color: '#FFFFFF' },
  netlify: { file: 'netlify.svg', color: '#00C7B7' },
  docker: { file: 'docker.svg', color: '#2496ED' },
  // Productivity
  notion: { file: 'notion.svg', color: '#FFFFFF' },
  confluence: { file: 'confluence.svg', color: '#2684FF' },
  googlecalendar: null,
  obsidian: { file: 'obsidian.svg', color: '#7C3AED' },
  airtable: { file: 'airtable.svg', color: '#18BFFF' },
  evernote: { file: 'evernote.svg', color: '#00A82D' },
  // Infrastructure
  azure: null,
  cloudflare: { file: 'cloudflare.svg', color: '#F38020' },
  kubernetes: { file: 'kubernetes.svg', color: '#326CE5' },
  aws: null,
  googlecloud: { file: 'googlecloud.svg', color: '#4285F4' },
  supabase: { file: 'supabase.svg', color: '#3FCF8E' },
  // Monitoring
  sentry: { file: 'sentry.svg', color: '#FB4226' },
  datadog: { file: 'datadog.svg', color: '#632CA6' },
  grafana: { file: 'grafana.svg', color: '#F46800' },
  pagerduty: { file: 'pagerduty.svg', color: '#06AC38' },
  prometheus: { file: 'prometheus.svg', color: '#E6522C' },
  // E-commerce
  stripe: { file: 'stripe.svg', color: '#635BFF' },
  paypal: { file: 'paypal.svg', color: '#003087' },
  shopify: { file: 'shopify.svg', color: '#96BF48' },
  // Design
  figma: null,
  canva: null,
  miro: { file: 'miro.svg', color: '#FFD02F' },
  // Data
  postgresql: { file: 'postgresql.svg', color: '#4169E1' },
  mongodb: { file: 'mongodb.svg', color: '#47A248' },
  mysql: { file: 'mysql.svg', color: '#4479A1' },
  redis: { file: 'redis.svg', color: '#DC382D' },
  elasticsearch: { file: 'elasticsearch.svg', color: '#005571' },
  bigquery: { file: 'googlebigquery.svg', color: '#669DF6' },
  // CRM
  hubspot: { file: 'hubspot.svg', color: '#FF7A59' },
  pipedrive: null,
  salesforce: null,
  zendesk: { file: 'zendesk.svg', color: '#03363D' },
  intercom: { file: 'intercom.svg', color: '#6AFDEF' },
  // Automation
  zapier: { file: 'zapier.svg', color: '#FF4A00' },
  n8n: { file: 'n8n.svg', color: '#EA4B71' },
  // Content
  contentful: { file: 'contentful.svg', color: '#2478CC' },
  sanity: { file: 'sanity.svg', color: '#F03E2F' },
  wordpress: { file: 'wordpress.svg', color: '#21759B' },
  ghost: { file: 'ghost.svg', color: '#15171A' },
  // Storage
  googledrive: null,
  // Social
  x: { file: 'x.svg', color: '#FFFFFF' },
  reddit: { file: 'reddit.svg', color: '#FF4500' },
  linkedin: null,
  youtube: { file: 'youtube.svg', color: '#FF0000' },
  // Email marketing
  mailchimp: { file: 'mailchimp.svg', color: '#FFE01B' },
  brevo: { file: 'brevo.svg', color: '#0B996E' },
  sendgrid: null,
  // Channel (always present)
  telegram: { file: 'telegram.svg', color: '#26A5E4' },
  // Messaging
  twilio: null,
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

/* ── Custom SVGs for brands not in simple-icons ── */

const azureSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M9.462 3.034L2.01 18.882l5.075.012 1.49-3.242h7.58l-.506 3.225 5.343.007L14.544 3.034H9.462zm1.758 4.87l3.69 7.593h-5.17l1.48-7.593z" fill="#0078D4"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'azure.svg'), azureSvg);
integrationCount++;

const pipedriveSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.8 5.2c1.546 0 2.8 1.433 2.8 3.2 0 1.767-1.254 3.2-2.8 3.2-.586 0-1.13-.207-1.574-.559l-.026.159V16.8h-1.6V8.4c0-.44.358-.8.8-.8.394 0 .72.285.783.66A2.637 2.637 0 0 1 13.8 7.2zm0 1.6c-.663 0-1.2.716-1.2 1.6s.537 1.6 1.2 1.6c.663 0 1.2-.716 1.2-1.6s-.537-1.6-1.2-1.6z" fill="#017737"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'pipedrive.svg'), pipedriveSvg);
integrationCount++;

/* ── More custom SVGs for brands not in simple-icons ── */

const awsSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.064.056.128.056.176 0 .08-.048.16-.152.24l-.504.336a.38.38 0 0 1-.208.072c-.08 0-.16-.04-.24-.112a2.5 2.5 0 0 1-.272-.352 5.6 5.6 0 0 1-.232-.44c-.584.688-1.32 1.032-2.208 1.032-.632 0-1.136-.18-1.504-.544-.368-.36-.552-.84-.552-1.432 0-.632.224-1.144.672-1.528.448-.384 1.044-.576 1.8-.576.248 0 .504.024.768.064.264.04.536.104.824.176v-.544c0-.568-.12-.968-.352-1.2-.24-.24-.64-.352-1.208-.352-.264 0-.528.032-.808.104-.28.072-.552.16-.816.272a2 2 0 0 1-.248.104c-.048.016-.088.024-.12.024-.104 0-.16-.072-.16-.224v-.384c0-.112.016-.2.056-.256.04-.064.112-.12.216-.176a4.3 4.3 0 0 1 .912-.312 4.2 4.2 0 0 1 1.128-.152c.864 0 1.496.196 1.896.592.4.392.6.992.6 1.8v2.368zM4.26 11.252c.248 0 .496-.044.76-.136.264-.088.496-.248.696-.472.12-.136.208-.288.264-.456a1.9 1.9 0 0 0 .088-.592v-.288a5.7 5.7 0 0 0-.656-.136 5.4 5.4 0 0 0-.672-.048c-.496 0-.856.096-1.096.296-.24.2-.36.48-.36.84 0 .336.088.592.264.768.176.184.432.272.768.272l-.056.016zm6.34 1.072a.33.33 0 0 1-.36-.248l-2.016-6.632a1.5 1.5 0 0 1-.072-.36c0-.144.072-.224.216-.224h.784c.2 0 .328.032.376.104.056.064.096.176.136.312l1.44 5.672 1.336-5.672c.032-.144.072-.256.128-.312.056-.072.184-.104.376-.104h.64c.2 0 .328.032.376.104.056.064.104.176.136.312l1.352 5.744 1.488-5.744c.04-.144.088-.248.136-.312.056-.072.184-.104.376-.104h.744c.144 0 .224.072.224.224 0 .048-.008.096-.016.152a1.3 1.3 0 0 1-.056.216l-2.072 6.632c-.04.144-.088.248-.144.312-.056.072-.176.104-.36.104h-.68c-.2 0-.328-.032-.376-.104-.056-.064-.104-.176-.136-.32l-1.328-5.528-1.32 5.52c-.032.152-.072.264-.128.328-.056.064-.184.104-.376.104h-.688zm10.148.216a5 5 0 0 1-1.128-.136c-.376-.088-.672-.2-.872-.328-.12-.08-.2-.168-.232-.248a.6.6 0 0 1-.048-.224v-.4c0-.152.056-.224.16-.224.04 0 .08.008.12.024.04.016.104.056.176.096.24.128.504.232.784.312.288.08.568.12.856.12.456 0 .808-.08 1.056-.248a.82.82 0 0 0 .368-.704.74.74 0 0 0-.2-.528c-.136-.136-.392-.264-.76-.384l-1.096-.344c-.552-.176-.96-.432-1.216-.768s-.384-.712-.384-1.128c0-.328.072-.616.208-.864.136-.248.32-.464.552-.632.232-.176.496-.304.808-.392.312-.088.64-.128.984-.128.176 0 .36.008.536.032.184.024.352.056.512.096.152.04.296.088.432.136.136.048.24.096.312.152a.7.7 0 0 1 .208.2.4.4 0 0 1 .064.24v.368c0 .152-.056.232-.16.232-.056 0-.144-.032-.264-.096a4 4 0 0 0-1.512-.296c-.408 0-.736.064-.968.2a.67.67 0 0 0-.336.6c0 .216.08.4.24.544s.408.28.808.408l1.072.336c.544.176.936.424 1.176.744.24.32.352.688.352 1.096 0 .336-.064.64-.2.904s-.328.496-.576.688c-.248.2-.544.344-.888.448-.36.112-.736.168-1.136.168z" fill="#FF9900"/>
<path d="M21.384 18.04c-2.648 1.96-6.496 3-9.808 3-4.64 0-8.816-1.712-11.976-4.56-.248-.224-.024-.528.272-.352 3.408 1.984 7.624 3.176 11.976 3.176 2.936 0 6.168-.608 9.144-1.864.448-.2.824.296.392.6z" fill="#FF9900"/>
<path d="M22.472 16.776c-.344-.44-2.248-.208-3.104-.104-.264.032-.296-.2-.064-.36 1.52-1.072 4.016-.76 4.304-.4.288.36-.08 2.864-1.504 4.06-.216.184-.424.088-.328-.152.32-.792 1.04-2.6.696-3.044z" fill="#FF9900"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'aws.svg'), awsSvg);
integrationCount++;

const mondaySvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M3.768 14.856a2.573 2.573 0 0 1-2.238-3.86l3.6-6.24a2.573 2.573 0 0 1 4.47.01 2.573 2.573 0 0 1-.003 2.57l-3.6 6.24a2.57 2.57 0 0 1-2.229 1.28z" fill="#FF3D57"/>
<path d="M11.997 14.856a2.573 2.573 0 0 1-2.238-3.86l3.6-6.24a2.573 2.573 0 0 1 4.47.01 2.573 2.573 0 0 1-.003 2.57l-3.6 6.24a2.57 2.57 0 0 1-2.229 1.28z" fill="#FFCB00"/>
<circle cx="20.227" cy="12.283" r="2.573" fill="#00D647"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'monday.svg'), mondaySvg);
integrationCount++;

const linkedinSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0A66C2"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'linkedin.svg'), linkedinSvg);
integrationCount++;

const canvaSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.14 16.49c-.27.588-.792 1.08-1.476 1.332-.396.144-.828.216-1.284.216-1.2 0-2.34-.564-3.264-1.452-.924-.888-1.668-2.136-2.088-3.564-.42-1.428-.468-2.82-.108-3.996.36-1.176 1.08-2.088 2.124-2.508.36-.144.732-.216 1.104-.216 1.284 0 2.412.816 3.072 1.956.108.192.06.432-.108.564a.42.42 0 0 1-.564-.048c-.48-.564-1.068-.924-1.644-.924-.276 0-.54.072-.78.228-.648.42-.96 1.344-.876 2.472.084 1.128.528 2.376 1.2 3.372.672.996 1.5 1.68 2.268 1.884.264.072.516.06.744-.048.624-.3.828-1.176.636-2.208a.42.42 0 0 1 .324-.492.42.42 0 0 1 .504.3c.264 1.284.072 2.412-.576 3.132z" fill="#00C4CC"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'canva.svg'), canvaSvg);
integrationCount++;

const salesforceSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M10.006 5.16a4.453 4.453 0 0 1 3.39-1.58 4.49 4.49 0 0 1 4.218 2.96 3.66 3.66 0 0 1 1.476-.308c2.05 0 3.71 1.68 3.71 3.752S21.14 13.735 19.09 13.735a3.7 3.7 0 0 1-.9-.112 3.85 3.85 0 0 1-3.516 2.285 3.8 3.8 0 0 1-1.716-.408 4.26 4.26 0 0 1-3.78 2.308 4.26 4.26 0 0 1-3.712-2.18 3.41 3.41 0 0 1-.64.064c-1.908 0-3.456-1.564-3.456-3.492 0-1.168.572-2.2 1.452-2.836a3.89 3.89 0 0 1-.352-1.624c0-2.152 1.736-3.896 3.876-3.896 1.318 0 2.484.664 3.18 1.676z" fill="#00A1E0"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'salesforce.svg'), salesforceSvg);
integrationCount++;

const sendgridSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M8 0h8v8h8v8h-8v8H8v-8H0V8h8V0z" fill="#1A82E2" fill-opacity="0.3"/>
<path d="M8 0h8v8h8v8h-8V8H8V0z" fill="#1A82E2"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'sendgrid.svg'), sendgridSvg);
integrationCount++;

const twilioSvg = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 20.25c-4.556 0-8.25-3.694-8.25-8.25S7.444 3.75 12 3.75s8.25 3.694 8.25 8.25-3.694 8.25-8.25 8.25z" fill="#F22F46"/>
<circle cx="9.75" cy="9.75" r="1.875" fill="#F22F46"/>
<circle cx="14.25" cy="9.75" r="1.875" fill="#F22F46"/>
<circle cx="9.75" cy="14.25" r="1.875" fill="#F22F46"/>
<circle cx="14.25" cy="14.25" r="1.875" fill="#F22F46"/>
</svg>`;
fs.writeFileSync(path.join(INTEGRATIONS_OUT, 'twilio.svg'), twilioSvg);
integrationCount++;

/* Also add the plug icon for palette command */
const plugSrc = path.join(LU, 'plug.svg');
if (fs.existsSync(plugSrc)) {
  fs.copyFileSync(plugSrc, path.join(OUT, 'plug.svg'));
}

console.log(
  `Copied ${Object.keys(brands).length + 2} brand icons, ${lucideIcons.length} UI icons, and ${integrationCount} integration icons to ${OUT}`,
);
