import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

/// The api crate manifest is the single source of the deployed version; the
/// site ships inside that image, so its footer reports the same number.
function apiVersion() {
  try {
    const manifest = readFileSync(
      fileURLToPath(new URL('../api/Cargo.toml', import.meta.url)),
      'utf8',
    );
    return manifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? 'dev';
  } catch {
    return 'dev';
  }
}

process.env.PUBLIC_HERBMAIL_VERSION = apiVersion();

export default defineConfig({
  site: 'https://herbmail.com',
  outDir: '../../../dist/apps/herbmail-web',
  integrations: [
    starlight({
      title: 'Herbmail',
      social: [],
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
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
