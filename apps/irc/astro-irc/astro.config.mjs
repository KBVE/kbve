import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://chat.kbve.com',
  outDir: '../../../dist/apps/astro-irc',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
