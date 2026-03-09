import { listen } from '@tauri-apps/api/event';
import { adoptGlobalStyles } from './shared/styles/inject.js';

type Route = 'palette' | 'canvas' | 'brain' | 'setup' | 'integrations';

const ROUTE_TAGS: Record<Route, string> = {
  palette: 'sauria-palette',
  canvas: 'sauria-canvas',
  brain: 'sauria-brain',
  setup: 'sauria-setup',
  integrations: 'sauria-integrations',
};

let currentRoute: Route | null = null;

async function navigate(route: Route): Promise<void> {
  if (route === currentRoute) return;
  currentRoute = route;

  const app = document.getElementById('app')!;
  const tag = ROUTE_TAGS[route];

  /* Remove current view */
  while (app.firstChild) app.firstChild.remove();

  /* Lazy-load the view module */
  switch (route) {
    case 'palette':
      await import('./palette/sauria-palette.js');
      break;
    case 'canvas':
      await import('./canvas/sauria-canvas.js');
      break;
    case 'brain':
      await import('./brain/sauria-brain.js');
      break;
    case 'setup':
      await import('./setup/sauria-setup.js');
      break;
    case 'integrations':
      await import('./integrations/sauria-integrations.js');
      break;
  }

  /* Set body class for back-button visibility */
  document.body.classList.toggle('in-palette', route !== 'palette');

  /* Create and mount the view element */
  app.appendChild(document.createElement(tag));
}

/* Inject global styles once */
adoptGlobalStyles();

/* Listen for Rust navigation events */
listen<string>('navigate', (event) => {
  const route = event.payload as Route;
  if (route in ROUTE_TAGS) navigate(route);
});

/* Initial route: palette */
navigate('palette');
