import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://discord.sh/',
  outDir: '../../../dist/apps/astro-discordsh',
  integrations: [
    starlight({
      title: 'Discord.sh',
      defaultLocale: 'en',
      locales: { en: { label: 'English' } },
      favicon: '/favicon.svg',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://discord.sh/og/default.png' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://discord.sh/og/default.png' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' } },
      ],
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
      },
      sidebar: [
        {
          label: 'Servers',
          autogenerate: { directory: 'servers' },
        },
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
