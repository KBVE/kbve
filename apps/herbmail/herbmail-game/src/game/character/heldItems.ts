// Data-driven registry for anything the character holds. Vertical hand-held items
// (torch, sword, …) are all treated the same: each declares its model-local long
// axis (handle -> tip) and where along it the hand grips. The attach path
// normalizes every item to a canonical vertical (long axis up, grip in the fist),
// then ONE shared VERTICAL_GRIP poses them identically. Tune that once with ` .

export const SWORD_URL = '/models/sword.glb';
export const TORCH_URL = '/models/torch.glb';

// Shared hold transform applied to every normalized vertical item. pos = palm
// offset from the wrist, rot = euler orienting the item's (up) axis in the hand.
export const VERTICAL_GRIP = {
	pos: [-0.06, 0, 0.02] as [number, number, number],
	rot: [-1.5, 0.2, 0.3] as [number, number, number],
};

export interface HeldItem {
	modelUrl: string;
	// Pivot object name. Keep 'weaponPivot' for melee weapons — useMelee finds the
	// hitbox by that name.
	pivotName: string;
	// Model-local axis pointing from the handle end to the tip.
	axis: [number, number, number];
	// Fraction along that axis (0 = handle end, 1 = tip) where the fist grips.
	gripFrac: number;
	scale: number;
	// Optional attachments driven generically by the frame loop.
	flame?: boolean;
	light?: { intensity: number; color: [number, number, number] };
}

export const HELD_ITEMS: Record<string, HeldItem> = {
	sword: {
		modelUrl: SWORD_URL,
		pivotName: 'weaponPivot',
		axis: [0, -1, 0], // +Y is pommel, blade tip toward -Y
		gripFrac: 0.12,
		scale: 1,
	},
	torch: {
		modelUrl: TORCH_URL,
		pivotName: 'torchPivot',
		axis: [0, 0, 1], // +Z is the flame head
		gripFrac: 0.12,
		scale: 0.55,
		flame: true,
		light: { intensity: 5, color: [1, 0.42, 0.13] },
	},
};

export function heldItem(id: string): HeldItem | undefined {
	return HELD_ITEMS[id];
}
