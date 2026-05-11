import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import worker from '@astropub/worker';
import sitemap from '@astrojs/sitemap';


export default defineConfig({
  site: 'https://chat.kbve.com',
  output: 'static',
  outDir: '../../../dist/apps/astro-irc',
  prefetch: true,
  integrations: [
    worker(),
    starlight({
      title: 'KBVE Chat',
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
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
      ],
    }),
    react(),
    sitemap({
			i18n: {
				defaultLocale: 'en',
				locales: {
					en: 'en',
				},
			},
		}),
  ],
  experimental: {
		queuedRendering: {
			enabled: true,
			poolSize: 3000,
			contentCache: true,
		},
	},
  vite: {
    plugins: [tailwindcss()],
  },
});
