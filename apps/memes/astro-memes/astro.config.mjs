import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://meme.sh/',
  outDir: '../../../dist/apps/astro-memes',
  integrations: [
    starlight({
      title: 'Meme.sh',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/kbve/kbve' },
        { icon: 'discord', label: 'Discord', href: 'https://kbve.com/discord' },
      ],
      customCss: [
        './src/styles/global.css',
      ],
      components: {
        Header: './src/components/header/Header.astro',
        Footer: './src/components/starlight/Footer.astro',
        PageTitle: './src/components/starlight/PageTitle.astro',
      },
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
