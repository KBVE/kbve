export const SWORD_URL = '/models/sword.glb';
export const TORCH_URL = '/models/torch.glb';

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
