import { describe, it, expect } from 'vitest';
import { resolveNpcSprite, DEFAULT_NPC_SPRITE } from './npcVisuals';
import { getAllNpcEntries } from './npcdb';

describe('npc visuals', () => {
	it('resolves explicit atlas frame mappings', () => {
		expect(resolveNpcSprite('cleric')).toMatchObject({
			key: 'monks',
			mapping: 0,
		});
		expect(resolveNpcSprite('crystal-bat')).toMatchObject({
			key: 'monster_bird',
			anim: 'bird',
		});
	});

	it('maps the cloud-city npcs now sourced from npcdb', () => {
		expect(resolveNpcSprite('barkeep').key).toBeTruthy();
		expect(resolveNpcSprite('monk').key).toBeTruthy();
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
