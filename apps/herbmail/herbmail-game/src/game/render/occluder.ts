// Dynamic ground occluder (the character) fed into the psx light-visibility
// raymarch, so torches cast a real shadow of the character across the floor and
// walls — no shadow maps, no fake ground disc.
export const charOccluder = { x: 0, z: 0, r: 0.4, on: 0 };

export function setCharOccluder(x: number, z: number, r = 0.4): void {
	charOccluder.x = x;
	charOccluder.z = z;
	charOccluder.r = r;
	charOccluder.on = 1;
}
