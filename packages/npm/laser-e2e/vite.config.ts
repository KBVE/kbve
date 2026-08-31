import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	root: __dirname,
	plugins: [react(), tsconfigPaths()],
	server: {
		port: 4300,
	},
	build: {
		outDir: '../../../dist/packages/npm/laser-e2e',
		emptyOutDir: true,
	},
});
