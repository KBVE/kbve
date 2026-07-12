export interface GripTransform {
	pos: [number, number, number];
	rot: [number, number, number];
	scale: number;
}

export const WEAPON_GRIP = {
	handBone: 'hand_r',
	handBoneLeft: 'hand_l',
	idleClip: 'Sword_Idle',
	// gripY: point along the sword's local +Y (0=tip .. 0.944=pommel) that the
	// hand grips. Handle sits ~0.85. Blade then extends the other way.
	sword: {
		gripY: 0.735,
		pos: [-0.025, 0.1, 0.095],
		rot: [-1.7, -1.3415, 0.038],
		scale: 1,
	} as GripTransform & { gripY: number },
	// Third-person hand attachment for the torch. Orientation is solved from the
	// hand bone rather than authored: `aim` is the desired head direction in the
	// character's own frame (y up, +z forward), `roll` spins it about its axis,
	// `pos` is the palm offset from the wrist bone. Independent of the bone's rest
	// orientation, so it holds correctly in any pose.
	torch: {
		pos: [0.02, 0, 0.06],
		aim: [0.1, 1, 0.12] as [number, number, number],
		roll: 0,
		scale: 0.55,
	},
};
