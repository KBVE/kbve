import { getNpcEntry, type Npc } from './npcdb';

// In-world sprite resolution for npcdb NPCs.
//
// The npcdb `sprite_atlas` field is the game-agnostic visual contract — the
// same descriptor the KBVENPCSprite UE module and other clients read. When an
// entry carries one, cryptothrone derives its sprite entirely from it (texture
// from `atlas_ref`, resting frame from the front row + idle clip, animation
// from `animation_set`, scale from the entry). Entries without a sprite_atlas
// fall back to a cryptothrone placeholder frame map, then a default, so a new
// npcdb NPC never renders blank.

export interface NpcSprite {
	key: string;
	mapping?: number;
	anim?: string;
	scale?: number;
}

type SpriteAtlas = NonNullable<Npc['sprite_atlas']>;

// Maps an agnostic `atlas_ref` (texture path / LFS ref) to the Phaser texture
// key cryptothrone preloads. Identity today; remap real asset paths here as
// bespoke sprite sheets land.
const ATLAS_TEXTURE_KEYS: Record<string, string> = {
	monks: 'monks',
	monster_bird: 'monster_bird',
};

function atlasTextureKey(ref: string): string {
	return ATLAS_TEXTURE_KEYS[ref] ?? ref;
}

// Placeholder atlas frames for npcdb entries that have no sprite_atlas yet.
const NPC_SPRITE_FRAMES: Record<string, NpcSprite> = {
	cleric: { key: 'monks', mapping: 0 },
	merchant: { key: 'monks', mapping: 1 },
	soldier: { key: 'monks', mapping: 2 },
	king: { key: 'monks', mapping: 3 },
	goblin: { key: 'monks', mapping: 4 },
	'goblin-general': { key: 'monks', mapping: 5 },
	wolf: { key: 'monks', mapping: 6 },
};

export const DEFAULT_NPC_SPRITE: NpcSprite = { key: 'monks', mapping: 0 };

/** Derive the in-world sprite straight from the agnostic sprite_atlas. */
function fromSpriteAtlas(atlas: SpriteAtlas, npc: Npc): NpcSprite {
	const columns = atlas.columns || 1;
	const front = atlas.row_front ?? 0;
	const idle =
		atlas.clips?.find((c) => c.anim === 'idle') ?? atlas.clips?.[0];
	// Resting frame = first cell of the front row, offset by the idle clip's
	// start column (a static NPC pins one frame via a 1-frame idle clip).
	const frame = front * columns + (idle?.start_frame ?? 0);
	return {
		key: atlasTextureKey(atlas.atlas_ref),
		mapping: frame,
		anim: npc.animation_set || undefined,
		scale: npc.scale ?? undefined,
	};
}

/**
 * Resolve the in-world sprite for an npcdb ref. A `sprite_atlas` (the agnostic
 * cross-mode descriptor) wins; otherwise the cryptothrone placeholder frame
 * map; otherwise the default placeholder.
 */
export function resolveNpcSprite(ref: string | null | undefined): NpcSprite {
	const npc = ref ? getNpcEntry(ref) : undefined;
	if (npc?.sprite_atlas?.atlas_ref) {
		return fromSpriteAtlas(npc.sprite_atlas, npc);
	}
	const frame = (ref && NPC_SPRITE_FRAMES[ref]) || DEFAULT_NPC_SPRITE;
	return {
		key: npc?.model_ref || frame.key,
		mapping: frame.mapping,
		anim: npc?.animation_set || frame.anim,
		scale: npc?.scale ?? frame.scale,
	};
}
