import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        palette: resolve(__dirname, 'src/renderer/palette/index.html'),
        canvas: resolve(__dirname, 'src/renderer/canvas/index.html'),
        brain: resolve(__dirname, 'src/renderer/brain/index.html'),
        setup: resolve(__dirname, 'src/renderer/setup/index.html'),
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
