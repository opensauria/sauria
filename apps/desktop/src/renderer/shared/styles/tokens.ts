import { css } from 'lit';
import {
  colors,
  radii,
  spacing,
  opacity,
  typography,
  transitions,
  entityColors,
  shadows,
  zIndex,
  observationColors,
  platformColors,
} from '@sauria/design-tokens';

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function toVars(prefix: string, tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([key, value]) => {
      const name = key === 'default' ? prefix : `${prefix}-${camelToKebab(key)}`;
      return `--${name}: ${value};`;
    })
    .join('\n  ');
}

const rootVars = `:root {
  ${toVars('', colors).replace(/---/g, '--')}
  ${toVars('radius', radii)}
  ${toVars('spacing', spacing)}
  --font-family: ${typography.fontFamily};
  --font-family-mono: ${typography.fontFamilyMono};
  --font-size-base: ${typography.sizeBase};
  --font-size-small: ${typography.sizeSmall};
  --font-size-x-small: ${typography.sizeXSmall};
  --font-size-label: ${typography.sizeLabel};
  --font-size-micro: ${typography.sizeMicro};
  --font-size-heading: ${typography.sizeHeading};
  --font-size-lg: ${typography.sizeLg};
  ${toVars('transition', transitions)}
  ${toVars('entity', entityColors)}
  ${toVars('shadow', shadows)}
  ${toVars('z', zIndex)}
  ${toVars('observation', observationColors)}
  ${toVars('platform', platformColors)}
  ${toVars('opacity', opacity)}
}`;

export const tokenStyles = css([rootVars] as unknown as TemplateStringsArray);
