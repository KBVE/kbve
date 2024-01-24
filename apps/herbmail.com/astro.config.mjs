import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import prefetch from '@astrojs/prefetch';
import mdx from '@astrojs/mdx';

import { fileURLToPath } from 'node:url';
import markdownConfig from './markdown.config';


// https://astro.build/config
export default defineConfig({
  site: 'https://herbmail.com/',
  outDir: '../../dist/apps/herbmail.com',
  markdown: markdownConfig,

  integrations: [
    react(),
    svelte(),
    partytown(),
    sitemap(),
    prefetch({
			throttle: 5,
		}),
    mdx({
			...markdownConfig,
			//extendPlugins: "astroDefaults"
		}),
    tailwind({
      configFile: fileURLToPath(
        new URL('./tailwind.config.cjs', import.meta.url)
      ),
    }),
  ],
});
