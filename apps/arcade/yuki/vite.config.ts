import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The chat stream and the docs metadata are still axum-kbve routes. Proxying
// them keeps the dev server same-origin, which EventSource needs.
const apiTarget = process.env['YUKI_API_TARGET'] ?? 'https://kbve.com';

export default defineConfig({
	plugins: [react()],
	server: {
		port: Number(process.env['YUKI_DEV_PORT'] ?? 4330),
		proxy: {
			'/api': {
				target: apiTarget,
				changeOrigin: true,
			},
		},
	},
	build: {
		target: 'es2022',
		rollupOptions: {
			input: {
				main: resolve(here, 'index.html'),
				jay: resolve(here, 'jay.html'),
			},
		},
	},
});
