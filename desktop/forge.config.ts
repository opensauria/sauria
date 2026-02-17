import type { ForgeConfig } from '@electron-forge/shared-types';
import MakerDMG from '@electron-forge/maker-dmg';
import MakerSquirrel from '@electron-forge/maker-squirrel';
import MakerDeb from '@electron-forge/maker-deb';
import MakerRPM from '@electron-forge/maker-rpm';
import MakerZIP from '@electron-forge/maker-zip';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'OpenWind',
    executableName: 'openwind-desktop',
    appBundleId: 'ai.openwind.desktop',
    icon: './assets/icon',
    asar: true,
    extraResource: ['../dist', '../package.json'],
  },
  makers: [
    new MakerDMG({
      format: 'ULFO',
      icon: './assets/icon.icns',
    }),
    new MakerSquirrel({
      name: 'OpenWind',
      iconUrl: 'https://openwind.ai/icon.ico',
      setupIcon: './assets/icon.ico',
    }),
    new MakerDeb({
      options: {
        icon: './assets/icon.png',
        maintainer: 'Teo Bouancheau',
        homepage: 'https://openwind.ai',
        description: 'Security-first persistent cognitive kernel',
        categories: ['Utility'],
      },
    }),
    new MakerRPM({
      options: {
        icon: './assets/icon.png',
        homepage: 'https://openwind.ai',
        description: 'Security-first persistent cognitive kernel',
        categories: ['Utility'],
      },
    }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
};

export default config;
