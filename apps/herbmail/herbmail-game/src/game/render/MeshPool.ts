import * as THREE from 'three';
import { EntityPool, MeshRef, Stone, Transform3 } from '@kbve/laser/ecs';
import { TORCH_HEAD_LOCAL, TORCH_MODEL_SCALE } from '../prop/torchModel';
import { MODEL_TORCH } from '../prop/kinds';
import { stoneGeometry } from '../prop/stoneModel';
import { makeCrackDecal } from './crateDecal';

const HEAD_LOCAL = TORCH_HEAD_LOCAL;

// Wooden ring bracket at the torch base where it meets the wall. Shared geometry
// + material across every torch (never per-torch disposed — see disposeObject).
const woodTex = new THREE.TextureLoader().load('/textures/wood_14_256_.png');
woodTex.magFilter = THREE.NearestFilter;
woodTex.minFilter = THREE.NearestMipmapNearestFilter;
woodTex.wrapS = THREE.RepeatWrapping;
woodTex.wrapT = THREE.RepeatWrapping;
woodTex.colorSpace = THREE.SRGBColorSpace;
const HOLDER_GEO = new THREE.TorusGeometry(0.16, 0.055, 6, 12);
const HOLDER_MAT = new THREE.MeshStandardMaterial({
	map: woodTex,
	roughness: 1,
});

function makeHolder(): THREE.Mesh {
	const ring = new THREE.Mesh(HOLDER_GEO, HOLDER_MAT);
	ring.position.z = 0.3;
	ring.userData.shared = true;
	return ring;
}

// Procedural stone lump depth. Geometry is built per-entity from the Stone seed;
// each stone clones its material off a shared template so disposeObject can free
// both the unique geometry and the clone without touching the shared textures.
const LUMPINESS = 0.35;

function rockTex(url: string, srgb: boolean): THREE.Texture {
	const t = new THREE.TextureLoader().load(url);
	t.magFilter = THREE.NearestFilter;
	t.minFilter = THREE.NearestMipmapNearestFilter;
	t.wrapS = THREE.RepeatWrapping;
	t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	return t;
}

const darkRockDiff = rockTex('/textures/dark_rock_diff_256.png', true);
const darkRockNor = rockTex('/textures/dark_rock_nor_256.png', false);
const STONE_MAT = new THREE.MeshStandardMaterial({
	map: darkRockDiff,
	normalMap: darkRockNor,
	roughness: 1,
	metalness: 0,
});

// Per-model layout: torches mount to a wall (head faces the room, wood holder at
// the base); crates stand upright on the floor and carry a melee hitbox so a
// swing can break them. modelId indexes the config table passed to the pool.
export interface ModelConfig {
	base?: THREE.Object3D;
	scale: number;
	orient: 'head' | 'upright';
	holder: boolean;
	hitbox: boolean;
	kind: string;
	build?: (eid: number) => THREE.Object3D;
	onCreate?: (group: THREE.Object3D) => void;
}

export function torchConfig(base: THREE.Object3D): ModelConfig {
	return {
		base,
		scale: TORCH_MODEL_SCALE,
		orient: 'head',
		holder: true,
		hitbox: false,
		kind: 'torch mount',
	};
}

export function crateConfig(base: THREE.Object3D): ModelConfig {
	return {
		base,
		scale: 1,
		orient: 'upright',
		holder: false,
		hitbox: true,
		kind: 'crate',
		onCreate: (group) => {
			const decal = makeCrackDecal();
			group.userData.crackDecalRef = decal;
			group.add(decal);
		},
	};
}

export function stoneConfig(): ModelConfig {
	return {
		scale: 1,
		orient: 'upright',
		holder: false,
		hitbox: true,
		kind: 'stone',
		build: (eid) => {
			const mesh = new THREE.Mesh(
				stoneGeometry(Stone.seed[eid], Stone.size[eid], LUMPINESS),
				STONE_MAT.clone(),
			);
			mesh.userData.kind = 'stone';
			return mesh;
		},
	};
}

// The crate GLB bakes its wood texture into the emissive slot with a black base
// colour, so it renders fully self-lit and ignores scene lights. Rewire the
// emissive map into the albedo slot and clear emissive so torch light drives it.
function delight(mat: THREE.MeshStandardMaterial): void {
	if (!mat.emissiveMap) return;
	mat.map = mat.emissiveMap;
	mat.emissiveMap = null;
	mat.emissive.setRGB(0, 0, 0);
	mat.color.setRGB(1, 1, 1);
	mat.roughness = 1;
	mat.metalness = 0;
	mat.needsUpdate = true;
}

function prep(base: THREE.Object3D, kind: string): THREE.Object3D {
	const clone = base.clone(true);
	clone.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		const src = (mesh.material = (
			mesh.material as THREE.MeshStandardMaterial
		).clone());
		delight(src);
		if (src.map) {
			src.map.magFilter = THREE.NearestFilter;
			src.map.minFilter = THREE.NearestMipmapNearestFilter;
			src.map.needsUpdate = true;
		}
		mesh.userData.kind = kind;
	});
	return clone;
}

function disposeObject(obj: THREE.Object3D): void {
	obj.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (mesh.isMesh && !mesh.userData.shared) {
			mesh.geometry?.dispose();
			(mesh.material as THREE.Material | undefined)?.dispose();
		}
	});
}

// GLB clone pool keyed by MeshRef prop entities. Props don't move, so meshes are
// placed once at create() from the Transform3 mount transform and only added /
// removed as rooms stream in and out. Layout comes from the per-model config.
export class MeshPool extends EntityPool<THREE.Object3D> {
	readonly root = new THREE.Group();

	constructor(private readonly configs: ModelConfig[]) {
		super([MeshRef, Transform3]);
	}

	protected create(eid: number): THREE.Object3D {
		const cfg =
			this.configs[MeshRef.modelId[eid]] ?? this.configs[MODEL_TORCH];
		const model = cfg.build
			? cfg.build(eid)
			: prep(cfg.base as THREE.Object3D, cfg.kind);
		model.userData.kind = cfg.kind;
		model.scale.setScalar(cfg.scale);

		const group = new THREE.Group();
		group.position.set(
			Transform3.px[eid],
			Transform3.py[eid],
			Transform3.pz[eid],
		);

		if (cfg.orient === 'head') {
			model.position.z = cfg.scale;
			const dir = new THREE.Vector3(
				Transform3.dx[eid],
				Transform3.dy[eid],
				Transform3.dz[eid],
			).normalize();
			group.quaternion.setFromUnitVectors(HEAD_LOCAL, dir);
		}

		group.add(model);
		if (cfg.holder) group.add(makeHolder());
		cfg.onCreate?.(group);
		group.traverse((o) => (o.userData.eid = eid));
		if (cfg.hitbox) group.userData.hitbox = true;

		this.root.add(group);
		return group;
	}

	protected destroy(item: THREE.Object3D): void {
		this.root.remove(item);
		disposeObject(item);
	}
}
