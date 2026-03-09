import type { CSSResult } from 'lit';
import { tokenStyles } from './tokens.js';
import { resetStyles } from './reset.js';
import { buttonStyles } from './button.js';
import { badgeStyles } from './badge.js';
import { cardStyles } from './card.js';
import { dialogStyles } from './dialog.js';
import { searchStyles } from './search.js';
import { emptyStateStyles } from './empty-state.js';
import { spinnerStyles } from './spinner.js';
import { tableStyles } from './table.js';
import { navStyles } from './nav.js';
import { segmentedToggleStyles } from './segmented-toggle.js';
import { formStyles } from './form.js';

let injected = false;

export function adoptGlobalStyles(): void {
  if (injected) return;
  injected = true;
  adoptStyles(
    tokenStyles,
    resetStyles,
    buttonStyles,
    badgeStyles,
    cardStyles,
    dialogStyles,
    searchStyles,
    emptyStateStyles,
    spinnerStyles,
    tableStyles,
    navStyles,
    segmentedToggleStyles,
    formStyles,
  );
}

export function adoptStyles(...styles: readonly CSSResult[]): void {
  const sheets = styles.map((s) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(s.cssText);
    return sheet;
  });
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
}
