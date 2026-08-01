import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests for the game's pure logic (dungeon parity, etc). Kept separate from
// the build config (vite.config.ts) — these specs need no DOM and no Phaser.
// laser is aliased to source; the root barrel is renderer-free (Phaser and
// three live behind the /phaser and /r3f subpaths), so node-env vitest can load
// it directly instead of the hand-written stub this used to need.
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@kbve\/laser\/(ecs|mecs|phaser|r3f)$/,
				replacement: path.resolve(
					__dirname,
					'../../../../packages/npm/laser/src/$1.ts',
				),
			},
			{
				find: /^@kbve\/laser$/,
				replacement: path.resolve(
					__dirname,
					'../../../../packages/npm/laser/src/index.ts',
				),
			},
		],
	},
	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		reporters: ['default'],
	},
});
