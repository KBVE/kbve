import { defineConfig } from 'vitest/config';

// Unit tests for the game's pure logic (dungeon parity, etc). Kept separate from
// the build config (vite.config.ts) — these specs need no DOM, no Phaser, and no
// laser source alias; they exercise plain TS. The dungeon parity spec pins the
// frozen FNV-1a fingerprint shared with simgrid's Rust arpg_dungeon.
export default defineConfig({
	test: {
		globals: true,
		watch: false,
		environment: 'node',
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		reporters: ['default'],
	},
});
