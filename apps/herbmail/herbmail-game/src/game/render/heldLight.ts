import * as THREE from 'three';

// Dynamic light for a torch held in the character's hand. Fed into LightSystem as
// an always-nearest source so it lights the walls (psx shader) and the character
// (real point light). Position is the flame head, updated each frame.
export const heldLight = {
	on: 0,
	pos: new THREE.Vector3(),
	r: 1.0,
	g: 0.42,
	b: 0.13,
	intensity: 0,
};

export function setHeldLight(
	x: number,
	y: number,
	z: number,
	intensity: number,
): void {
	heldLight.on = 1;
	heldLight.pos.set(x, y, z);
	heldLight.intensity = intensity;
}

export function clearHeldLight(): void {
	heldLight.on = 0;
	heldLight.intensity = 0;
}
