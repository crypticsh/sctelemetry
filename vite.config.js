import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const api = `http://localhost:${process.env.SCT_PORT || 8420}`;

export default defineConfig({
  root: 'web',
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  server: {
    host: true,
    proxy: { '/api': api, '/ws': { target: api.replace('http', 'ws'), ws: true } },
  },
});
