/// <reference types='vitest' />
import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const laserSrc = path.resolve(__dirname, '../../../packages/npm/laser/src');

// Cross-origin isolation enables SharedArrayBuffer (worker/GPU shared memory).
// Dev + preview set the headers directly; the built bundle relies on
// coi-serviceworker.js (public/) so the itch upload is isolated on any static host.
const coiHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	root: __dirname,
	base: './',
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
		// vitest's node resolver doesn't pick up the @kbve/laser/* tsconfig-path
		// aliases (nxViteTsPaths only wires them for build/dev), so map the subpaths to
		// source here and inline the package for transform.
		alias: {
			'@kbve/laser/mecs': path.join(laserSrc, 'mecs.ts'),
			'@kbve/laser/ecs': path.join(laserSrc, 'ecs.ts'),
		},
		server: { deps: { inline: [/@kbve\/laser/] } },
	},
});
