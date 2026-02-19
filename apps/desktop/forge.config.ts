import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import MakerDMG from '@electron-forge/maker-dmg';
import MakerSquirrel from '@electron-forge/maker-squirrel';
import MakerDeb from '@electron-forge/maker-deb';
import MakerRPM from '@electron-forge/maker-rpm';
import MakerZIP from '@electron-forge/maker-zip';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'OpenSauria',
    executableName: 'opensauria-desktop',
    appBundleId: 'ai.opensauria.desktop',
    icon: './assets/icon',
    asar: true,
    extraResource: ['../daemon/dist', '../daemon/package.json'],
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/app.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
  makers: [
    new MakerDMG({
      format: 'ULFO',
      icon: './assets/icon.icns',
    }),
    new MakerSquirrel({
      name: 'OpenSauria',
      iconUrl: 'https://opensauria.ai/icon.ico',
      setupIcon: './assets/icon.ico',
    }),
    new MakerDeb({
      options: {
        icon: './assets/icon.png',
        maintainer: 'Teo Bouancheau',
        homepage: 'https://opensauria.ai',
        description: 'Security-first persistent cognitive kernel',
        categories: ['Utility'],
      },
    }),
    new MakerRPM({
      options: {
        icon: './assets/icon.png',
        homepage: 'https://opensauria.ai',
        description: 'Security-first persistent cognitive kernel',
        categories: ['Utility'],
      },
    }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
};

export default config;
