import { describe, it, expect } from 'vitest';
import type { KindEntry } from '@kbve/laser';
import {
	makeKindResolvers,
	KIND_CAT_ITEM,
	KIND_CAT_NPC,
	KIND_CAT_PLAYER,
} from './kindResolvers';

function registry(entries: KindEntry[]): Map<number, KindEntry> {
	return new Map(entries.map((e) => [e.kind, e]));
}

describe('makeKindResolvers', () => {
	const reg = registry([
		{ kind: 0, ref: 'hero', cat: KIND_CAT_PLAYER },
		{ kind: 1, ref: 'goblin', cat: KIND_CAT_NPC },
		{ kind: 2, ref: 'potion', cat: KIND_CAT_ITEM },
	]);
	const k = makeKindResolvers(reg);

	it('resolves cat/ref by kind', () => {
		expect(k.cat(2)).toBe(KIND_CAT_ITEM);
		expect(k.ref(1)).toBe('goblin');
	});

	it('maps cat to EntityCat name', () => {
		expect(k.catName(0)).toBe('player');
		expect(k.catName(1)).toBe('npc');
		expect(k.catName(2)).toBe('item');
	});

	it('defaults unknown kinds to npc/null', () => {
		expect(k.cat(99)).toBe(KIND_CAT_NPC);
		expect(k.ref(99)).toBeNull();
		expect(k.catName(99)).toBe('npc');
	});

	it('reads the live registry reference', () => {
		const live = new Map<number, KindEntry>();
		const r = makeKindResolvers(live);
		expect(r.ref(7)).toBeNull();
		live.set(7, { kind: 7, ref: 'wolf', cat: KIND_CAT_NPC });
		expect(r.ref(7)).toBe('wolf');
	});
});
