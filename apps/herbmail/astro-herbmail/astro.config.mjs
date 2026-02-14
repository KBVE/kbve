import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://herbmail.com',
  outDir: '../../../dist/apps/astro-herbmail',
  integrations: [
    starlight({
      title: 'Herbmail',
      social: [],
      customCss: [
        './src/styles/global.css',
      ],
      sidebar: [
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
