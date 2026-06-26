/**
 * Deterministic RNG primitives — byte-for-byte mirror of the Rust server
 * (packages/rust/simgrid/src/rng.rs). The server owns the root seed and ships
 * only a u32 seed; the client reproduces the identical rolls (crit prediction)
 * and procedural layouts (dungeons) locally.
 *
 * Pure 32-bit lane only (Math.imul + `>>> 0`) — no BigInt. The server's u64
 * `hash3` lane is server-only and intentionally not mirrored.
 *
 * Domain separation: every consumer mixes a distinct `Domain` tag so combat
 * rolls can never correlate with dungeon layout (or any other system).
 */

/** Big-endian FourCC → u32, matching Rust `u32::from_be_bytes(b"....")`. */
function fourcc(s: string): number {
	return (
		((s.charCodeAt(0) << 24) |
			(s.charCodeAt(1) << 16) |
			(s.charCodeAt(2) << 8) |
			s.charCodeAt(3)) >>>
		0
	);
}

/** RNG domain tags. Frozen — must match the Rust `domain` module. */
export const Domain = {
	COMBAT: fourcc('COMB'),
	DUNGEON: fourcc('DUNG'),
	WANDER: fourcc('WAND'),
	LOOT: fourcc('LOOT'),
	TREE: fourcc('TREE'),
	BUSH: fourcc('BUSH'),
} as const;

/** Mulberry32 — mirrors Rust `Mulberry32`. Returns a u32-yielding generator. */
export function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
		t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
		return (t ^ (t >>> 14)) >>> 0;
	};
}

/** FNV-1a over the little-endian bytes of each u32 word. Mirrors Rust `mix32`. */
export function mix32(words: number[]): number {
	let h = 0x811c9dc5;
	for (const w of words) {
		const u = w >>> 0;
		for (let shift = 0; shift < 32; shift += 8) {
			h = (h ^ ((u >>> shift) & 0xff)) >>> 0;
			h = Math.imul(h, 0x01000193) >>> 0;
		}
	}
	return h >>> 0;
}

/** Seed a Mulberry32 stream for a domain + context. Mirrors Rust `stream`. */
export function stream(
	root: number,
	domain: number,
	ctx: number[] = [],
): () => number {
	return mulberry32(mix32([root, domain, ...ctx]));
}

/** One-shot roll in [0, 100) for a domain + context. Mirrors Rust `roll_pct`. */
export function rollPct(
	root: number,
	domain: number,
	ctx: number[] = [],
): number {
	return stream(root, domain, ctx)() % 100;
}
