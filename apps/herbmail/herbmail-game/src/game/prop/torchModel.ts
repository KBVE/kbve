import * as THREE from 'three';

// Single source of truth for the torch GLB's local layout. The wall mount and the
// hand grip both derive from this so the head/handle ends can never disagree:
//   +z  = flame head  (wall mounts orient +z to the wall normal)
//   -z  = handle       (the hand grips near this end)
export const TORCH_HEAD_LOCAL = new THREE.Vector3(0, 0, 1);
export const TORCH_MODEL_SCALE = 1.1;

// How far up the handle (fraction of total length from the -z tip) the fist grips.
const TORCH_GRIP_FRAC = 0.12;

export interface TorchModelDims {
	headZ: number; // local z of the flame head
	gripZ: number; // local z the hand grips
	cx: number;
	cy: number;
}

export function torchModelDims(obj: THREE.Object3D): TorchModelDims {
	const box = new THREE.Box3().setFromObject(obj);
	const lenZ = box.max.z - box.min.z;
	return {
		headZ: box.max.z,
		gripZ: box.min.z + TORCH_GRIP_FRAC * lenZ,
		cx: (box.min.x + box.max.x) / 2,
		cy: (box.min.y + box.max.y) / 2,
	};
}
