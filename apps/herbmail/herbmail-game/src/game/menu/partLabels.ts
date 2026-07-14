import { ARMOR_PIECES, pieceLabel } from '../character/armor';

// Bare-body mesh names → friendly labels. Armor slot labels are derived from
// ARMOR_PIECES below so the codex hover matches the equip UI wording.
const BODY: Record<string, string> = {
	SKIN_TORS: 'Torso',
	SKIN_HIPS: 'Hips',
	SKIN_LEGL: 'Leg (L)',
	SKIN_LEGR: 'Leg (R)',
	SKIN_HNDL: 'Hand (L)',
	SKIN_HNDR: 'Hand (R)',
	SKIN_FOTL: 'Foot (L)',
	SKIN_FOTR: 'Foot (R)',
	SKIN_AUPL: 'Upper Arm (L)',
	SKIN_AUPR: 'Upper Arm (R)',
	SKIN_ALWL: 'Forearm (L)',
	SKIN_ALWR: 'Forearm (R)',
	SKIN_WRAP: 'Underwear',
	HEAD: 'Head',
	HAIR: 'Hair',
	EARL: 'Ear (L)',
	EARR: 'Ear (R)',
	EBRL: 'Eyebrow (L)',
	EBRR: 'Eyebrow (R)',
	EYEL: 'Eye (L)',
	EYER: 'Eye (R)',
	NOSE: 'Nose',
	TETH: 'Teeth',
	TONG: 'Tongue',
};

const SLOT_LABEL: Record<string, string> = {};
for (const p of ARMOR_PIECES)
	for (const s of p.slots) SLOT_LABEL[s] = pieceLabel(p.id);

/** Friendly label for a SIDEKICK slot mesh (armor piece wins over bare body). */
export function partLabel(name: string | undefined): string | null {
	if (!name) return null;
	return SLOT_LABEL[name] ?? BODY[name] ?? null;
}
