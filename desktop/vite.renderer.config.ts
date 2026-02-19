import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        canvas: resolve(__dirname, 'src/renderer/canvas/index.html'),
        palette: resolve(__dirname, 'src/renderer/palette/index.html'),
        setup: resolve(__dirname, 'src/renderer/setup/index.html'),
        brain: resolve(__dirname, 'src/renderer/brain/index.html'),
      },
    },
  },
});
