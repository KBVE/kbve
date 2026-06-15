import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.JOBBOARD_API_TARGET || 'http://127.0.0.1:5400';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: '/',
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
	server: {
		port: 5401,
		strictPort: true,
		proxy: {
			'/api': {
				target: API_TARGET,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
