export interface GripTransform {
	pos: [number, number, number];
	rot: [number, number, number];
	scale: number;
}

export const WEAPON_GRIP = {
	handBone: 'hand_r',
	handBoneLeft: 'hand_l',
	idleClip: 'Sword_Idle',

	sword: {
		gripY: 0.735,
		pos: [-0.025, 0.1, 0.095],
		rot: [-1.7, -1.3415, 0.038],
		scale: 1,
	} as GripTransform & { gripY: number },

	torch: {
		pos: [0.02, 0, 0.06],
		aim: [0.1, 1, 0.12] as [number, number, number],
		roll: 0,
		scale: 0.55,
	},
};
