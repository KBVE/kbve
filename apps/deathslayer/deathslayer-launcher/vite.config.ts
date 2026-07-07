import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	clearScreen: false,
	server: {
		host: host || false,
		port: 1423,
		strictPort: true,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
});
