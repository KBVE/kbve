/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Cross-origin isolation enables SharedArrayBuffer (worker/GPU shared memory).
// Dev + preview set the headers directly; the built bundle relies on
// coi-serviceworker.js (public/) so the itch upload is isolated on any static host.
const coiHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	root: __dirname,
	plugins: [react(), nxViteTsPaths()],
	server: {
		port: 4310,
		headers: coiHeaders,
	},
	preview: {
		headers: coiHeaders,
	},
	worker: {
		format: 'es',
	},
	build: {
		outDir: '../../../dist/apps/herbmail/herbmail-game',
		emptyOutDir: true,
	},
	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		reporters: ['default'],
	},
});
