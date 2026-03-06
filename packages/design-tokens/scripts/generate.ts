/**
 * Generates CSS custom properties and JSON from the typed token definitions.
 *
 * Output:
 *   generated/tokens.css  — CSS :root block with custom properties
 *   generated/tokens.json — flat key-value JSON for non-CSS consumers
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, radii, spacing, typography, transitions, entityColors } from '../src/tokens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'generated');

mkdirSync(outDir, { recursive: true });

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function generateCssProperties(
  prefix: string,
  tokens: Record<string, string>,
): string[] {
  return Object.entries(tokens).map(([key, value]) => {
    const name = key === 'default' ? prefix : `${prefix}-${camelToKebab(key)}`;
    return `  --${name}: ${value};`;
  });
}

const lines: string[] = [
  '/* Auto-generated from @sauria/design-tokens — do not edit manually */',
  '',
  ':root {',
  ...generateCssProperties('', colors).map((l) =>
    l.replace('--', '--').replace('---', '--'),
  ),
  '',
  ...generateCssProperties('radius', radii),
  '',
  ...generateCssProperties('spacing', spacing),
  '',
  ...generateCssProperties('font', {
    family: typography.fontFamily,
    familyMono: typography.fontFamilyMono,
  }),
  ...generateCssProperties('font-size', {
    base: typography.sizeBase,
    small: typography.sizeSmall,
    xSmall: typography.sizeXSmall,
    label: typography.sizeLabel,
    micro: typography.sizeMicro,
    heading: typography.sizeHeading,
  }),
  '',
  ...generateCssProperties('transition', transitions),
  '',
  ...generateCssProperties('entity', entityColors),
  '}',
  '',
];

// Fix color token names to match existing CSS convention
const cssContent = lines
  .join('\n')
  .replace(/--bg-solid/g, '--bg-solid')
  .replace(/--surface-hover/g, '--surface-hover')
  .replace(/--border-active/g, '--border-active')
  .replace(/--text-secondary/g, '--text-secondary')
  .replace(/--text-dim/g, '--text-dim')
  .replace(/--accent-hover/g, '--accent-hover');

writeFileSync(join(outDir, 'tokens.css'), cssContent);

// JSON output
const jsonTokens: Record<string, string> = {};

for (const [key, value] of Object.entries(colors)) {
  jsonTokens[`color.${camelToKebab(key)}`] = value;
}
for (const [key, value] of Object.entries(radii)) {
  jsonTokens[`radius.${key === 'default' ? 'default' : camelToKebab(key)}`] = value;
}
for (const [key, value] of Object.entries(spacing)) {
  jsonTokens[`spacing.${key}`] = value;
}
for (const [key, value] of Object.entries(typography)) {
  jsonTokens[`typography.${camelToKebab(key)}`] = value;
}
for (const [key, value] of Object.entries(transitions)) {
  jsonTokens[`transition.${camelToKebab(key)}`] = value;
}
for (const [key, value] of Object.entries(entityColors)) {
  jsonTokens[`entity.${key}`] = value;
}

writeFileSync(join(outDir, 'tokens.json'), JSON.stringify(jsonTokens, null, 2) + '\n');

console.log(`Generated ${Object.keys(jsonTokens).length} tokens to ${outDir}/`);
