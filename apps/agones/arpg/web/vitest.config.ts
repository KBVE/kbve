import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests for the game's pure logic (dungeon parity, etc). Kept separate from
// the build config (vite.config.ts) — these specs need no DOM, no Phaser, and no
// laser source alias; they exercise plain TS. The dungeon parity spec pins the
// frozen FNV-1a fingerprint shared with simgrid's Rust arpg_dungeon.
//
// @kbve/laser resolves to a pure-leaf stub, not the runtime barrel: the barrel
// value-exports Phaser-backed helpers that node-env vitest cannot load, while
// the values these spec graphs execute live in pure leaves (heightfield,
// game-auth). Type-only laser imports are erased before resolution.
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@kbve\/laser$/,
				replacement: path.resolve(
					__dirname,
					'src/test/laser-vitest-stub.ts',
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
