import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openwind', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  detectClients: () => ipcRenderer.invoke('detect-clients'),
  detectLocalProviders: () => ipcRenderer.invoke('detect-local-providers'),
  validateKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('validate-key', provider, apiKey),
  configure: (opts: {
    mode: 'claude_desktop' | 'api_key' | 'local';
    provider: string;
    apiKey: string;
    localBaseUrl: string;
  }) => ipcRenderer.invoke('configure', opts),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  startOAuth: () => ipcRenderer.invoke('start-oauth'),
  completeOAuth: (code: string) => ipcRenderer.invoke('complete-oauth', code),
  executeCommand: (id: string) => ipcRenderer.invoke('execute-command', id),
  hidePalette: () => ipcRenderer.invoke('hide-palette'),
  onCommandResult: (cb: (result: string) => void) =>
    ipcRenderer.on('command-result', (_event, result: string) => cb(result)),
  onPaletteShow: (cb: () => void) => ipcRenderer.on('palette-show', () => cb()),
  onPaletteReset: (cb: () => void) => ipcRenderer.on('palette-reset', () => cb()),
  getTelegramStatus: () => ipcRenderer.invoke('get-telegram-status'),
  onShowTelegramForm: (cb: () => void) => ipcRenderer.on('show-telegram-form', () => cb()),

  // CEO profile
  getCeoProfile: () => ipcRenderer.invoke('get-ceo-profile'),

  // Canvas IPC
  getCanvasGraph: () => ipcRenderer.invoke('get-canvas-graph'),
  saveCanvasGraph: (graph: unknown) => ipcRenderer.invoke('save-canvas-graph', graph),
  connectChannel: (platform: string, credentials: unknown) =>
    ipcRenderer.invoke('connect-channel', platform, credentials),
  disconnectChannel: (platform: string, nodeId: string) =>
    ipcRenderer.invoke('disconnect-channel', platform, nodeId),
  onCanvasUpdate: (cb: (graph: unknown) => void) =>
    ipcRenderer.on('canvas-update', (_event, graph: unknown) => cb(graph)),
  showCanvas: () => ipcRenderer.invoke('show-canvas'),
  executeCeoCommand: (command: string) => ipcRenderer.invoke('execute-ceo-command', command),
});
