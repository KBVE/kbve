import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  outDir: '../../dist/apps/rareicon.com',
  integrations: [
    react(),
    svelte(),
    partytown(),
    sitemap(),
    tailwind({
      configFile: fileURLToPath(
        new URL('./tailwind.config.cjs', import.meta.url)
      ),
    }),
  ],
});
