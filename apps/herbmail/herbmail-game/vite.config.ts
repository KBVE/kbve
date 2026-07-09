import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
	root: __dirname,
	plugins: [react(), nxViteTsPaths()],
	server: {
		port: 4310,
	},
	build: {
		outDir: '../../../dist/apps/herbmail/herbmail-game',
		emptyOutDir: true,
	},
});
