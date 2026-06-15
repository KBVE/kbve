import { getNpcEntry } from './npcdb';

// In-world sprite resolution for npcdb NPCs.
//
// Frame indices into cryptothrone's shared atlases are game-specific, so they
// live here rather than in the shared npcdb. Everything else can be driven by
// the npcdb entry: `model_ref` → texture key, `animation_set` → animation,
// `scale` → sprite scale. Every ref resolves to SOMETHING renderable — unknown
// NPCs fall back to the placeholder so a new npcdb entry never renders blank.

export interface NpcSprite {
	key: string;
	mapping?: number;
	anim?: string;
	scale?: number;
}

// Per-ref atlas frame mapping (cryptothrone 'monks' atlas + the bird monster).
const NPC_SPRITE_FRAMES: Record<string, NpcSprite> = {
	cleric: { key: 'monks', mapping: 0 },
	merchant: { key: 'monks', mapping: 1 },
	soldier: { key: 'monks', mapping: 2 },
	king: { key: 'monks', mapping: 3 },
	goblin: { key: 'monks', mapping: 4 },
	'goblin-general': { key: 'monks', mapping: 5 },
	wolf: { key: 'monks', mapping: 6 },
	'crystal-bat': { key: 'monster_bird', anim: 'bird' },
	// Cloud City residents now sourced from npcdb — placeholder atlas frames
	// until bespoke portraits ship.
	barkeep: { key: 'monks', mapping: 1 },
	monk: { key: 'monks', mapping: 0 },
};

export const DEFAULT_NPC_SPRITE: NpcSprite = { key: 'monks', mapping: 0 };

/**
 * Resolve the in-world sprite for an npcdb ref. npcdb visual hints
 * (`model_ref` / `animation_set` / `scale`) win when present; otherwise the
 * cryptothrone frame map; otherwise the placeholder.
 */
export function resolveNpcSprite(ref: string | null | undefined): NpcSprite {
	const frame = (ref && NPC_SPRITE_FRAMES[ref]) || DEFAULT_NPC_SPRITE;
	const npc = ref ? getNpcEntry(ref) : undefined;
	return {
		key: npc?.model_ref || frame.key,
		mapping: frame.mapping,
		anim: npc?.animation_set || frame.anim,
		scale: npc?.scale ?? frame.scale,
	};
}
