export interface GripTransform {
	pos: [number, number, number];
	rot: [number, number, number];
	scale: number;
}

export const WEAPON_GRIP = {
	handBone: 'hand_r',
	idleClip: 'Sword_Idle',
	// gripY: point along the sword's local +Y (0=tip .. 0.944=pommel) that the
	// hand grips. Handle sits ~0.85. Blade then extends the other way.
	sword: {
		gripY: 0.735,
		pos: [-0.025, 0.1, 0.095],
		rot: [-1.7, -1.3415, 0.038],
		scale: 1,
	} as GripTransform & { gripY: number },
	// Third-person hand attachment for the torch (distinct from the LOADOUT grip,
	// which is authored for the FPS viewmodel arms).
	torch: {
		pos: [0, 0.05, 0.09],
		rot: [-2.05, -0.2, 0],
		scale: 0.55,
	} as GripTransform,
};
