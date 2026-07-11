import * as THREE from 'three';
import {
	hasComponent,
	LightEmitter,
	query,
	Transform3,
	type World,
} from '@kbve/laser/ecs';
import { FireflyFx } from '../prop/components';
import { MAX_LIGHTS, LIGHT_RANGE } from './PsxMaterial';
import type { OcclusionField } from '../dungeon/occlusion';
import { heldLight } from './heldLight';
import { playerAnchor } from './playerAnchor';

const HEAD_REACH = 1.122;
const HEAD_OFFSET = 0.28;
const CULL_RADIUS = 22;
const CULL_SQ = CULL_RADIUS * CULL_RADIUS;
const POINT_LIGHTS = 6;
const POINT_SCALE = 3.0;
const SHADOW_CASTERS = 2;

interface Ranked {
	x: number;
	y: number;
	z: number;
	r: number;
	g: number;
	b: number;
	dist: number;
	pdist: number;
	intensity: number;
	tier: number;
}

// Reads all LightEmitter props each frame, ranks them by camera distance, and
// feeds the nearest MAX_LIGHTS into the PSX shader uniforms plus the nearest
// POINT_LIGHTS real point lights (for standard-material meshes the shader misses).
// Ported from the retired TorchLighting component.
export class LightSystem {
	readonly root = new THREE.Group();
	private readonly lights: THREE.PointLight[] = [];
	private readonly shadowLights: THREE.PointLight[] = [];
	private readonly pos = Array.from(
		{ length: MAX_LIGHTS },
		() => new THREE.Vector3(),
	);
	private readonly col = Array.from(
		{ length: MAX_LIGHTS },
		() => new THREE.Vector3(),
	);
	private ranked: Ranked[] = [];

	constructor() {
		for (let i = 0; i < POINT_LIGHTS; i++) {
			const pl = new THREE.PointLight(0xff8a3c, 0, LIGHT_RANGE, 2);
			pl.visible = false;
			this.lights.push(pl);
			this.root.add(pl);
		}
		for (let i = 0; i < SHADOW_CASTERS; i++) {
			const sl = new THREE.PointLight(0xffffff, 0, LIGHT_RANGE, 2);
			sl.castShadow = true;
			sl.visible = false;
			sl.shadow.mapSize.set(512, 512);
			sl.shadow.camera.near = 0.2;
			sl.shadow.camera.far = LIGHT_RANGE;
			sl.shadow.bias = -0.005;
			sl.shadow.radius = 4;
			this.shadowLights.push(sl);
			this.root.add(sl);
		}
	}

	tick(
		world: World,
		scene: THREE.Scene,
		camera: THREE.Camera,
		time: number,
		occ: OcclusionField,
		ambient: number,
	): void {
		this.ranked.length = 0;
		for (const eid of query(world, [LightEmitter, Transform3])) {
			const firefly = hasComponent(world, eid, FireflyFx);
			const dx = Transform3.dx[eid];
			const dy = Transform3.dy[eid];
			const dz = Transform3.dz[eid];
			const len = Math.hypot(dx, dy, dz) || 1;
			const reach = firefly ? 0 : HEAD_REACH;
			const yoff = firefly ? 0 : HEAD_OFFSET;
			const x = Transform3.px[eid] + (dx / len) * reach;
			const y = Transform3.py[eid] + (dy / len) * reach + yoff;
			const z = Transform3.pz[eid] + (dz / len) * reach;

			const ph = LightEmitter.flickerPhase[eid];
			const amp = LightEmitter.flickerAmp[eid];
			const f =
				0.85 +
				amp *
					(0.08 * Math.sin(time * 2.1 + ph) +
						0.05 * Math.sin(time * 3.7 + ph * 1.7) +
						0.025 * Math.sin(time * 6.3 + ph * 2.3));

			const pdx = x - playerAnchor.pos.x;
			const pdz = z - playerAnchor.pos.z;
			const pd2 = pdx * pdx + pdz * pdz;
			if (pd2 > CULL_SQ) continue;

			const ddx = x - camera.position.x;
			const ddy = y - camera.position.y;
			const ddz = z - camera.position.z;
			this.ranked.push({
				x,
				y,
				z,
				r: LightEmitter.r[eid],
				g: LightEmitter.g[eid],
				b: LightEmitter.b[eid],
				dist: ddx * ddx + ddy * ddy + ddz * ddz,
				pdist: pd2,
				intensity: LightEmitter.baseIntensity[eid] * f,
				tier: firefly ? 1 : 0,
			});
		}

		// Torch held in hand: always the nearest source (lights walls + character).
		if (heldLight.on) {
			const flick =
				0.85 +
				0.1 * Math.sin(time * 2.3) +
				0.05 * Math.sin(time * 4.1 + 1.3);
			this.ranked.push({
				x: heldLight.pos.x,
				y: heldLight.pos.y,
				z: heldLight.pos.z,
				r: heldLight.r,
				g: heldLight.g,
				b: heldLight.b,
				dist: 0,
				pdist: 0,
				intensity: heldLight.intensity * flick,
				tier: 0,
			});
		}

		this.ranked.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
		const count = Math.min(this.ranked.length, MAX_LIGHTS);

		for (let i = 0; i < count; i++) {
			const l = this.ranked[i];
			this.pos[i].set(l.x, l.y, l.z);
			this.col[i].set(l.r, l.g, l.b).multiplyScalar(l.intensity);
		}

		// Every PSX material shares LightSystem's own pos/col arrays by reference, so
		// the per-light vectors are written once (above) instead of copied into each
		// material. Chunked geometry means thousands of meshes; per-mesh copies here
		// would dominate the frame. Only cheap per-material scalars/refs remain.
		scene.traverse((obj) => {
			const mat = (obj as THREE.Mesh).material as
				| (THREE.ShaderMaterial & {
						uniforms?: Record<string, { value: unknown }>;
				  })
				| undefined;
			const u = mat?.uniforms;
			if (!u || !u.uLightPos) return;
			u.uLightCount.value = count;
			u.uAmbient.value = ambient;
			u.uMapTex.value = occ.tex;
			(u.uGridOrigin.value as THREE.Vector2).copy(occ.origin);
			(u.uGridSize.value as THREE.Vector2).copy(occ.size);
			if (u.uLightPos.value !== this.pos) u.uLightPos.value = this.pos;
			if (u.uLightColor.value !== this.col)
				u.uLightColor.value = this.col;
		});

		for (let i = 0; i < POINT_LIGHTS; i++) {
			const pl = this.lights[i];
			if (i < count) {
				const l = this.ranked[i];
				pl.position.set(l.x, l.y, l.z);
				pl.color.setRGB(l.r, l.g, l.b);
				pl.intensity = l.intensity * POINT_SCALE;
				pl.visible = true;
			} else {
				pl.visible = false;
			}
		}

		const byPlayer = this.ranked
			.slice()
			.sort((a, b) => a.tier - b.tier || a.pdist - b.pdist);
		for (let i = 0; i < SHADOW_CASTERS; i++) {
			const sl = this.shadowLights[i];
			if (i < byPlayer.length) {
				const l = byPlayer[i];
				sl.position.set(l.x, l.y, l.z);
				sl.visible = true;
			} else {
				sl.visible = false;
			}
		}
	}

	dispose(): void {
		for (const pl of this.lights) this.root.remove(pl);
		for (const sl of this.shadowLights) {
			sl.shadow.map?.dispose();
			this.root.remove(sl);
		}
	}
}
