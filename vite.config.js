import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps every asset URL relative, so the built site works at any
// GitHub Pages sub-path (https://<user>.github.io/<repo>/) without hardcoding
// the repository name. Data is fetched with a relative URL for the same reason.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
