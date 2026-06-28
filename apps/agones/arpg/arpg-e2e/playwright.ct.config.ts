import { defineConfig, devices } from '@playwright/experimental-ct-react';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');

// Resolve @kbve/laser (and its data deps) to source, mirroring the arpg web
// vite config so isolated component tests bundle the exact same modules the app
// ships. laser's index re-exports an r3f lane the battle UI never touches, so we
// stub it the same way the app does to keep the CT bundle lean.
function stubLaserR3F() {
	const virtual = '\0arpg-laser-r3f-stub';
	return {
		name: 'stub-laser-r3f',
		enforce: 'pre' as const,
		resolveId(source: string) {
			return /[\\/]lib[\\/]r3f[\\/]/.test(source) ? virtual : null;
		},
		load(id: string) {
			return id === virtual
				? 'export const Stage = () => null; export const useGameLoop = () => {};'
				: null;
		},
	};
}

const alias = [
	{
		find: /^@kbve\/laser$/,
		replacement: path.join(repoRoot, 'packages/npm/laser/src/index.ts'),
	},
	{
		find: /^@kbve\/itemdb-data$/,
		replacement: path.join(
			repoRoot,
			'packages/data/codegen/generated/itemdb.json',
		),
	},
	{
		find: /^@kbve\/spelldb-data$/,
		replacement: path.join(
			repoRoot,
			'packages/data/codegen/generated/spelldb-data.json',
		),
	},
	{
		find: /^@kbve\/itemdb-schema$/,
		replacement: path.join(
			repoRoot,
			'packages/data/codegen/generated/itemdb-schema.ts',
		),
	},
];

export default defineConfig({
	testDir: './ct',
	testMatch: '**/*.spec.tsx',
	fullyParallel: true,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: process.env['CI'] ? 1 : undefined,
	reporter: 'html',
	use: {
		trace: 'on-first-retry',
		ctViteConfig: {
			plugins: [stubLaserR3F(), react()],
			resolve: {
				dedupe: [
					'react',
					'react-dom',
					'bitecs',
					'phaser',
					'@phaserjs/rapier-connector',
				],
				alias,
				extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
			},
		},
	},
	projects: [{ name: 'ct-chromium', use: { ...devices['Desktop Chrome'] } }],
});
