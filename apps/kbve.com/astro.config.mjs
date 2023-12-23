import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import { fileURLToPath } from 'node:url';

import markdownConfig from './markdown.config';


// https://astro.build/config
export default defineConfig({
  outDir: '../../dist/apps/kbve.com',
  markdown: markdownConfig,

  integrations: [
    react(),
    svelte(),
    partytown(),
    sitemap(),
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
