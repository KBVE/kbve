/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
	root: __dirname,
	cacheDir:
		'../../../node_modules/.vite/apps/cryptothrone/astro-cryptothrone',
	plugins: [react(), nxViteTsPaths()],
	test: {
		globals: true,
		watch: false,
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		reporters: ['default'],
		coverage: {
			provider: 'v8',
			reportsDirectory: './coverage/unit',
			reporter: ['text-summary', 'lcovonly'],
			include: [
				'src/components/game/store/game-store.ts',
				'src/components/game/store/GameStoreContext.tsx',
				'src/components/game/data/items.ts',
				'src/components/game/data/itemdb.ts',
				'src/components/game/data/npcdb.ts',
				'src/components/game/data/npcs.ts',
				'src/components/game/ui/ToggleButton.tsx',
				'src/components/game/ui/StatsSection.tsx',
			],
		},
	},
});
