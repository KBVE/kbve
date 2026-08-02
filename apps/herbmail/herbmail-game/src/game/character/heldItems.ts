import { modelUrl } from './modelUrl';

export const SWORD_URL = modelUrl('/models/sword.glb');
export const TORCH_URL = modelUrl('/models/torch.glb');
export const PICKAXE_URL = modelUrl('/models/pickaxe.glb');

export const VERTICAL_GRIP = {
	pos: [-0.06, 0, 0.02] as [number, number, number],
	rot: [-1.5, 0.2, 0.3] as [number, number, number],
};

export const VERTICAL_GRIP_LEFT = {
	pos: [0.06, 0, 0.02] as [number, number, number],
	rot: [-1.5, -0.2, -0.3] as [number, number, number],
};

export interface HeldItem {
	modelUrl: string;

	pivotName: string;

	axis: [number, number, number];

	gripFrac: number;
	scale: number;

	// Replaces the hand's shared VERTICAL_GRIP rotation outright when set.
	rot?: [number, number, number];

	flame?: boolean;
	light?: { intensity: number; color: [number, number, number] };
}

export const HELD_ITEMS: Record<string, HeldItem> = {
	sword: {
		modelUrl: SWORD_URL,
		pivotName: 'weaponPivot',
		axis: [0, -1, 0],
		gripFrac: 0.12,
		scale: 1,
	},
	// Authored head-up (head at the +Y end), the opposite of the sword — so it takes
	// no flip, otherwise gripFrac measures up from the head and the hand grabs it.
	pickaxe: {
		modelUrl: PICKAXE_URL,
		pivotName: 'weaponPivot',
		axis: [0, 1, 0],
		gripFrac: 0.12,
		scale: 1,
		rot: [-1.5, -1.6, 0.3],
	},
	torch: {
		modelUrl: TORCH_URL,
		pivotName: 'torchPivot',
		axis: [0, 0, 1],
		gripFrac: 0.12,
		scale: 0.55,
		flame: true,
		light: { intensity: 3.2, color: [1, 0.45, 0.16] },
	},
};

export function heldItem(id: string): HeldItem | undefined {
	return HELD_ITEMS[id];
}
