import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  outDir: '../../dist/apps/cryptothrone.com',
  integrations: [
    react(),
    svelte(),
    vue(),
    partytown(),
    sitemap(),
    tailwind({
      configFile: fileURLToPath(
        new URL('./tailwind.config.cjs', import.meta.url),
      ),
    }),
  ],
});
