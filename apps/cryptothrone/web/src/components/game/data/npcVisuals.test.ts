import { describe, it, expect } from 'vitest';
import { resolveNpcSprite, DEFAULT_NPC_SPRITE } from './npcVisuals';
import { getAllNpcEntries, getNpcEntry } from './npcdb';

describe('npc visuals', () => {
	it('drives the sprite from the agnostic npcdb sprite_atlas when present', () => {
		// barkeep: front row 0 of an 8-col atlas, idle clip pins start_frame 1.
		expect(resolveNpcSprite('barkeep')).toMatchObject({
			key: 'monks',
			mapping: 1,
		});
		// monk: same atlas, idle clip frame 0.
		expect(resolveNpcSprite('monk')).toMatchObject({
			key: 'monks',
			mapping: 0,
		});
		// crystal-bat: animated atlas → texture + animation_set drive it.
		expect(resolveNpcSprite('crystal-bat')).toMatchObject({
			key: 'monster_bird',
			anim: 'bird',
		});
	});

	it('matches the sprite_atlas resting frame to (row_front*columns + idle start)', () => {
		const atlas = getNpcEntry('barkeep')!.sprite_atlas!;
		const expected =
			(atlas.row_front ?? 0) * (atlas.columns || 1) +
			(atlas.clips?.[0]?.start_frame ?? 0);
		expect(resolveNpcSprite('barkeep').mapping).toBe(expected);
	});

	it('falls back to the placeholder frame map for entries without sprite_atlas', () => {
		expect(getNpcEntry('cleric')!.sprite_atlas).toBeUndefined();
		expect(resolveNpcSprite('cleric')).toMatchObject({
			key: 'monks',
			mapping: 0,
		});
	});

	it('falls back to the placeholder for unknown / missing refs', () => {
		expect(resolveNpcSprite('totally-unknown')).toMatchObject({
			key: DEFAULT_NPC_SPRITE.key,
			mapping: DEFAULT_NPC_SPRITE.mapping,
		});
		expect(resolveNpcSprite(undefined).key).toBe(DEFAULT_NPC_SPRITE.key);
	});

	it('resolves every npcdb entry to a renderable sprite key', () => {
		for (const n of getAllNpcEntries()) {
			expect(resolveNpcSprite(n.ref).key.length).toBeGreaterThan(0);
		}
	});
});
