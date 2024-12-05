import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	build: {
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'DiscordSDKManager',
			fileName: (format) => `discord-sdk-manager.${format}.js`,
		},
		outDir: path.resolve(__dirname, '../../dist/packages/unity-js/vite'),
        emptyOutDir: true,
		rollupOptions: {
			external: [],
		},
		sourcemap: true,
		minify: true,
	},
});
