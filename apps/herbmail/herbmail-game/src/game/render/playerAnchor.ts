import * as THREE from 'three';

// Character floor position, updated each frame by CharacterShadow. LightSystem
// reads it to pick shadow-casting torches by distance to the player (stable while
// the player is idle) rather than by camera distance (which pops as the camera
// orbits).
export const playerAnchor = {
	on: 0,
	pos: new THREE.Vector3(),
};

export function setPlayerAnchor(x: number, y: number, z: number): void {
	playerAnchor.on = 1;
	playerAnchor.pos.set(x, y, z);
}
