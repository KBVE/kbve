import * as THREE from 'three';

export const TORCH_HEAD_LOCAL = new THREE.Vector3(0, 0, 1);
export const TORCH_MODEL_SCALE = 1.1;

const TORCH_GRIP_FRAC = 0.12;

export interface TorchModelDims {
	headZ: number;
	gripZ: number;
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
