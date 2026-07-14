import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.RENTEARTH_API_TARGET || 'http://127.0.0.1:4323';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: '/',
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
	server: {
		port: 5402,
		strictPort: true,
		proxy: {
			'/api': { target: API_TARGET, changeOrigin: true, secure: false },
			'/downloads': { target: API_TARGET, changeOrigin: true, secure: false },
		},
	},
});
