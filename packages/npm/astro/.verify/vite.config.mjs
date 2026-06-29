import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Standalone harness for browser-driving the SiteGraph React island in
// isolation (real d3-force + real DOM paint), without booting the full Astro
// site. @kbve/droid is stubbed — only the graph itself is under test.
export default defineConfig({
	root: import.meta.dirname,
	plugins: [react()],
	resolve: {
		alias: {
			'@kbve/droid': fileURLToPath(
				new URL('./droid-stub.ts', import.meta.url),
			),
		},
	},
	server: { port: 4330 },
});
