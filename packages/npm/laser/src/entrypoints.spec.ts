import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guards the entry-point split. laser is consumed as SOURCE (tsconfig path +
 * vite alias), so its bare imports resolve relative to packages/npm/laser, which
 * has no node_modules. The repo root's hoisted tree masks that locally; a
 * container's bounded install does not, and vite substitutes an optional-peer
 * stub that rollup then dies on. That failure is always CI-only, and it landed
 * four separate times (bitecs, phaser, @phaserjs/rapier-connector, drei) before
 * the barrel was split. This asserts the split statically so a fifth import
 * can't quietly re-widen an entry point.
 */

const SRC = __dirname;

/** Non-optional peers. They are always installed, so they can never be stubbed. */
const ALWAYS = ['react', 'react-dom'];

/** Optional peers each entry point is allowed to reach. */
const ALLOWED: Record<string, readonly string[]> = {
	'index.ts': ['bitecs', 'fastnoise-lite'],
	'ecs.ts': ['bitecs'],
	'mecs.ts': [],
	'phaser.ts': ['phaser', '@phaserjs/rapier-connector'],
	'r3f.ts': ['three', '@react-three/fiber', '@react-three/drei'],
};

const BARE = /^[^./]/;

function resolveRelative(fromFile: string, spec: string): string | null {
	const base = path.resolve(path.dirname(fromFile), spec);
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, 'index.ts'),
		path.join(base, 'index.tsx'),
	];
	return (
		candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null
	);
}

/**
 * Bare specifiers reachable from `entry`, following relative imports. Type-only
 * imports are erased before resolution, so they can't pull a peer at runtime and
 * are excluded.
 */
function bareImports(entry: string): Set<string> {
	const seen = new Set<string>();
	const bare = new Set<string>();
	const queue = [entry];

	while (queue.length) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);

		const src = readFileSync(file, 'utf8');
		const statements = src.matchAll(
			/(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g,
		);

		for (const [, clause, spec] of statements) {
			if (/^\s*type\b/.test(clause)) continue;
			if (BARE.test(spec)) {
				// Subpath imports of a peer still pull the peer.
				bare.add(
					spec.startsWith('@')
						? spec.split('/').slice(0, 2).join('/')
						: spec.split('/')[0],
				);
				continue;
			}
			const next = resolveRelative(file, spec);
			if (next) queue.push(next);
		}

		for (const [, spec] of src.matchAll(
			/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		)) {
			if (BARE.test(spec)) {
				bare.add(
					spec.startsWith('@')
						? spec.split('/').slice(0, 2).join('/')
						: spec.split('/')[0],
				);
			} else {
				const next = resolveRelative(file, spec);
				if (next) queue.push(next);
			}
		}
	}

	return bare;
}

describe('laser entry points', () => {
	for (const entry of Object.keys(ALLOWED)) {
		it(`${entry} exists`, () => {
			expect(existsSync(path.join(SRC, entry))).toBe(true);
		});
	}

	for (const [entry, allowed] of Object.entries(ALLOWED)) {
		it(`${entry} pulls no peer outside its declared set`, () => {
			const leaked = [...bareImports(path.join(SRC, entry))]
				.filter((s) => !s.startsWith('node:'))
				.filter((s) => !ALWAYS.includes(s) && !allowed.includes(s))
				.sort();

			expect(
				leaked,
				`${entry} reaches ${leaked.join(', ')}. A module needing an optional ` +
					`peer belongs behind a subpath entry, not in this one — see ` +
					`package.json "exports".`,
			).toEqual([]);
		});
	}

	it('every exports subpath maps to a real entry file', () => {
		const pkg = JSON.parse(
			readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'),
		) as { exports: Record<string, unknown> };

		for (const key of Object.keys(pkg.exports)) {
			const name = key === '.' ? 'index.ts' : `${key.slice(2)}.ts`;
			expect(
				existsSync(path.join(SRC, name)),
				`exports["${key}"] has no src/${name}`,
			).toBe(true);
		}
	});
});
