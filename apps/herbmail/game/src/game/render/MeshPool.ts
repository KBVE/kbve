import * as THREE from 'three';
import { EntityPool } from '../mecs/pool';
import { Collider, MeshRef, Stone, Transform3 } from '../mecs/props';
import { TORCH_HEAD_LOCAL, TORCH_MODEL_SCALE } from '../prop/torchModel';
import { MOUNT_OFF } from '../prop/torch';
import { MODEL_TORCH } from '../prop/kinds';
import { stoneGeometry } from '../prop/stoneModel';
import { hash01 } from '../geometry/rng';
import { makeCrackDecal } from './crateDecal';
import { asset } from '../assetBase';

const HEAD_LOCAL = TORCH_HEAD_LOCAL;

// Wooden ring bracket at the torch base where it meets the wall. Shared geometry
// + material across every torch (never per-torch disposed — see disposeObject).
const woodTex = new THREE.TextureLoader().load(
	asset('/textures/wood_14_256_.png'),
);
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
	ring.userData.shared = true;
	return ring;
}

function makeBlobTexture(): THREE.Texture {
	const s = 64;
	const cv = document.createElement('canvas');
	cv.width = s;
	cv.height = s;
	const ctx = cv.getContext('2d');
	if (!ctx) return new THREE.Texture();
	const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	g.addColorStop(0, 'rgba(0,0,0,0.55)');
	g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
	g.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, s, s);
	const tex = new THREE.CanvasTexture(cv);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

const BLOB_GEO = new THREE.CircleGeometry(1, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({
	map: makeBlobTexture(),
	transparent: true,
	depthWrite: false,
	opacity: 1,
});

function makeBlobShadow(radius: number): THREE.Mesh {
	const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
	blob.rotation.x = -Math.PI / 2;
	blob.scale.setScalar(Math.max(radius, 0.25) * 1.7);
	blob.renderOrder = 1;
	blob.raycast = () => undefined;
	blob.userData.shared = true;
	return blob;
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

const darkRockDiff = rockTex(asset('/textures/dark_rock_diff_256.png'), true);
const darkRockNor = rockTex(asset('/textures/dark_rock_nor_256.png'), false);
const STONE_MAT = new THREE.MeshStandardMaterial({
	map: darkRockDiff,
	normalMap: darkRockNor,
	roughness: 1,
	metalness: 0,
	vertexColors: true,
});
const ORE_MAT = new THREE.MeshStandardMaterial({
	map: darkRockDiff,
	normalMap: darkRockNor,
	roughness: 0.55,
	metalness: 0.6,
	emissive: new THREE.Color(0x2b5f7a),
	emissiveIntensity: 0.5,
	vertexColors: true,
});
const CRYSTAL_MAT = new THREE.MeshStandardMaterial({
	color: new THREE.Color(0x1c3d4a),
	roughness: 0.25,
	metalness: 0.4,
	emissive: new THREE.Color(0x4fb6d6),
	emissiveIntensity: 0.9,
	flatShading: true,
});
const CRYSTAL_GEO = new THREE.OctahedronGeometry(1, 0);

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

function buildStone(eid: number): THREE.Object3D {
	const seed = Stone.seed[eid];
	const size = Stone.size[eid];
	const ore = Stone.ore[eid] > 0;
	const group = new THREE.Group();

	const main = new THREE.Mesh(
		stoneGeometry(seed, size, LUMPINESS),
		STONE_MAT.clone(),
	);
	main.userData.kind = 'stone';
	group.add(main);

	const satellites = 1 + Math.floor(hash01(seed, 71, 5) * 3);
	for (let i = 0; i < satellites; i++) {
		const ss = size * (0.28 + hash01(seed, 200 + i * 13, 41) * 0.24);
		const ang = hash01(seed, 300 + i * 13, 9) * Math.PI * 2;
		const dist = size * (0.85 + hash01(seed, 400 + i * 13, 3) * 0.5);
		const oreSat = ore && i === 0;
		const chunk = new THREE.Mesh(
			stoneGeometry(seed + 1013 + i * 97, ss, LUMPINESS * 1.2),
			(oreSat ? ORE_MAT : STONE_MAT).clone(),
		);
		chunk.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
		chunk.rotation.y = ang;
		chunk.userData.kind = 'stone';
		group.add(chunk);
	}

	if (ore) {
		const vein = new THREE.Mesh(
			stoneGeometry(seed + 7001, size * 0.5, LUMPINESS * 1.4),
			ORE_MAT.clone(),
		);
		vein.position.set(0, size * 0.3, 0);
		vein.scale.set(1, 0.6, 1);
		vein.userData.kind = 'stone';
		group.add(vein);

		const shards = 3 + Math.floor(hash01(seed, 511, 7) * 4);
		for (let i = 0; i < shards; i++) {
			const ang = hash01(seed, 600 + i * 17, 23) * Math.PI * 2;
			const pitch = 0.15 + hash01(seed, 610 + i * 17, 5) * 0.8;
			const rad = size * (0.35 + hash01(seed, 620 + i * 17, 11) * 0.4);
			const len = size * (0.18 + hash01(seed, 630 + i * 17, 3) * 0.28);
			const wide = len * (0.3 + hash01(seed, 640 + i * 17, 9) * 0.25);
			const cx = Math.cos(ang) * rad * Math.cos(pitch);
			const cz = Math.sin(ang) * rad * Math.cos(pitch);
			const cy = size * (0.15 + Math.sin(pitch) * 0.7);
			const shard = new THREE.Mesh(CRYSTAL_GEO, CRYSTAL_MAT.clone());
			shard.position.set(cx, cy, cz);
			shard.scale.set(wide, len, wide);
			shard.rotation.set(
				(hash01(seed, 650 + i * 17, 2) - 0.5) * 1.1,
				ang,
				(hash01(seed, 660 + i * 17, 4) - 0.5) * 1.1,
			);
			shard.userData.kind = 'stone';
			shard.userData.sharedGeo = true;
			group.add(shard);
		}
	}

	group.userData.kind = 'stone';
	return group;
}

export function stoneConfig(): ModelConfig {
	return {
		scale: 1,
		orient: 'upright',
		holder: false,
		hitbox: true,
		kind: 'stone',
		build: (eid) => buildStone(eid),
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

// Prep the base GLTF's materials in place, once. Every prop of this model is
// identical, so delight + nearest filtering only needs to happen on the single
// shared material — clones reference it, never re-clone or re-upload it.
function prepBase(base: THREE.Object3D): void {
	base.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh || mesh.userData.prepped) return;
		const mat = mesh.material as THREE.MeshStandardMaterial;
		delight(mat);
		if (mat.map) {
			mat.map.magFilter = THREE.NearestFilter;
			mat.map.minFilter = THREE.NearestMipmapNearestFilter;
			mat.map.needsUpdate = true;
		}
		mesh.userData.prepped = true;
	});
}

function prep(base: THREE.Object3D, kind: string): THREE.Object3D {
	prepBase(base);
	const clone = base.clone(true);
	clone.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.userData.kind = kind;
		// clone() shares BOTH the GLTF geometry and the prepped material by
		// reference across every prop instance — free neither on despawn.
		mesh.userData.shared = true;
	});
	return clone;
}

function disposeObject(obj: THREE.Object3D): void {
	obj.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		// `shared`: geometry AND material are singletons (the torch ring, and every
		// prepped GLTF prop — clones reference one material) — free neither.
		// `sharedGeo`: geometry shared across clones but the material is a per-instance
		// clone (the crack decal) — free only the material. Untagged (stones): both are
		// per-entity — free both. Freeing a shared resource on each despawn forced a
		// full GPU re-upload every time a room streamed out.
		if (mesh.userData.shared) return;
		if (!mesh.userData.sharedGeo) mesh.geometry?.dispose();
		(mesh.material as THREE.Material | undefined)?.dispose();
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
			);
			// A zero direction (dir never written) normalizes to (0,0,0) →
			// setFromUnitVectors yields a NaN quaternion that corrupts the instance.
			if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
			else dir.normalize();
			group.quaternion.setFromUnitVectors(HEAD_LOCAL, dir);

			if (cfg.holder) {
				const holder = makeHolder();
				const horiz = Math.hypot(dir.x, dir.z);
				holder.position.z = horiz > 1e-4 ? -MOUNT_OFF / horiz : 0;
				group.add(holder);
			}
		}

		group.add(model);
		cfg.onCreate?.(group);
		if (cfg.hitbox) {
			const blob = makeBlobShadow(Collider.hx[eid] || cfg.scale);
			blob.position.y = 0.02;
			group.add(blob);
		}
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
