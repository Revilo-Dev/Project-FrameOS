import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Classic, self-contained SystemJS output also works in packaged widget origins.
    legacy({ targets: ['chrome >= 69'], renderModernChunks: false }),
    {
      name: 'frameos-widget-scripts',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        // Classic local widget scripts must not request CORS at a file: origin.
        handler: (html) => html.replace(/<script\b[^>]*>/g, (tag) => tag.replace(/\s+crossorigin(?:="[^"]*")?/g, '')),
      },
    },
  ],
  build: { cssTarget: 'chrome69', assetsInlineLimit: 0 },
});
