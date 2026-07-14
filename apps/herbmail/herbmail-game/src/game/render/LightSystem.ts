import * as THREE from 'three';
import {
	hasComponent,
	LightEmitter,
	each,
	Transform3,
	type World,
} from '../mecs/props';
import { FireflyFx } from '../prop/components';
import { MAX_LIGHTS, LIGHT_RANGE, psxMaterialRegistry } from './PsxMaterial';
import type { OcclusionField } from '../dungeon/occlusion';
import { heldLight } from './heldLight';
import { playerAnchor } from './playerAnchor';
import { FOG } from '../config';

const HEAD_REACH = 1.122;
const HEAD_OFFSET = 0.28;
// Consider any emitter within visible range: a torch you could see (out to the fog
// wall, plus its own LIGHT_RANGE glow radius) must still be fed to the shader.
const CULL_RADIUS = FOG.far + LIGHT_RANGE;
const CULL_SQ = CULL_RADIUS * CULL_RADIUS;
const POINT_LIGHTS = 6;
const POINT_SCALE = 3.0;
const SHADOW_CASTERS = 2;
// Hoisted so the mecs `each` name-map is cached (zero per-frame allocation).
const LIGHT_TERMS = [LightEmitter, Transform3];

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
	// Persistent Ranked pool reused across frames; `active` holds references to the
	// filled entries this frame (no per-emitter object allocation). `casters` is a
	// reused 2-slot buffer for the nearest-to-player shadow lights.
	private readonly pool: Ranked[] = [];
	private active: Ranked[] = [];
	private casters: (Ranked | null)[] = [null, null];
	private frame = 0;

	private take(): Ranked {
		let r = this.pool[this.active.length];
		if (!r) {
			r = {
				x: 0,
				y: 0,
				z: 0,
				r: 0,
				g: 0,
				b: 0,
				dist: 0,
				pdist: 0,
				intensity: 0,
				tier: 0,
			};
			this.pool[this.active.length] = r;
		}
		return r;
	}

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
			sl.shadow.autoUpdate = false;
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
		camera: THREE.Camera,
		time: number,
		occ: OcclusionField,
		ambient: number,
	): void {
		this.active.length = 0;
		each(world, LIGHT_TERMS, (eid) => {
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
			if (pd2 > CULL_SQ) return;

			const ddx = x - camera.position.x;
			const ddy = y - camera.position.y;
			const ddz = z - camera.position.z;
			const l = this.take();
			l.x = x;
			l.y = y;
			l.z = z;
			l.r = LightEmitter.r[eid];
			l.g = LightEmitter.g[eid];
			l.b = LightEmitter.b[eid];
			l.dist = ddx * ddx + ddy * ddy + ddz * ddz;
			l.pdist = pd2;
			l.intensity = LightEmitter.baseIntensity[eid] * f;
			l.tier = firefly ? 1 : 0;
			this.active.push(l);
		});

		// Torch held in hand: always the nearest source (lights walls + character).
		if (heldLight.on) {
			const flick =
				0.85 +
				0.1 * Math.sin(time * 2.3) +
				0.05 * Math.sin(time * 4.1 + 1.3);
			const l = this.take();
			l.x = heldLight.pos.x;
			l.y = heldLight.pos.y;
			l.z = heldLight.pos.z;
			l.r = heldLight.r;
			l.g = heldLight.g;
			l.b = heldLight.b;
			l.dist = 0;
			l.pdist = 0;
			l.intensity = heldLight.intensity * flick;
			l.tier = 0;
			this.active.push(l);
		}

		this.active.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
		const count = Math.min(this.active.length, MAX_LIGHTS);

		for (let i = 0; i < count; i++) {
			const l = this.active[i];
			this.pos[i].set(l.x, l.y, l.z);
			this.col[i].set(l.r, l.g, l.b).multiplyScalar(l.intensity);
		}

		// Every PSX material shares LightSystem's own pos/col arrays by reference, so
		// the per-light vectors are written once (above) instead of copied into each
		// material. Iterate the material registry directly (only live PSX materials)
		// rather than walking the whole scene graph's thousands of meshes each frame.
		for (const mat of psxMaterialRegistry) {
			const u = (
				mat as THREE.ShaderMaterial & {
					uniforms: Record<string, { value: unknown }>;
				}
			).uniforms;
			if (!u.uLightPos) continue;
			u.uLightCount.value = count;
			u.uAmbient.value = ambient;
			u.uMapTex.value = occ.tex;
			(u.uGridOrigin.value as THREE.Vector2).copy(occ.origin);
			(u.uGridSize.value as THREE.Vector2).copy(occ.size);
			if (u.uLightPos.value !== this.pos) u.uLightPos.value = this.pos;
			if (u.uLightColor.value !== this.col)
				u.uLightColor.value = this.col;
		}

		for (let i = 0; i < POINT_LIGHTS; i++) {
			const pl = this.lights[i];
			if (i < count) {
				const l = this.active[i];
				pl.position.set(l.x, l.y, l.z);
				pl.color.setRGB(l.r, l.g, l.b);
				pl.intensity = l.intensity * POINT_SCALE;
				pl.visible = true;
			} else {
				pl.visible = false;
			}
		}

		// Nearest-to-player SHADOW_CASTERS (2), linear-scanned into a reused buffer —
		// no slice/sort. Ordered by tier then player distance.
		this.casters[0] = null;
		this.casters[1] = null;
		for (const l of this.active) {
			const c0 = this.casters[0];
			const c1 = this.casters[1];
			if (
				!c0 ||
				l.tier < c0.tier ||
				(l.tier === c0.tier && l.pdist < c0.pdist)
			) {
				this.casters[1] = c0;
				this.casters[0] = l;
			} else if (
				!c1 ||
				l.tier < c1.tier ||
				(l.tier === c1.tier && l.pdist < c1.pdist)
			) {
				this.casters[1] = l;
			}
		}
		// Flicker is intensity-only and torches are static, so cube shadow maps
		// (6 scene passes each) only re-render every 3rd frame or when the caster
		// actually moves.
		this.frame++;
		const refresh = this.frame % 3 === 0;
		for (let i = 0; i < SHADOW_CASTERS; i++) {
			const sl = this.shadowLights[i];
			const l = this.casters[i];
			if (l) {
				const moved =
					sl.position.x !== l.x ||
					sl.position.y !== l.y ||
					sl.position.z !== l.z;
				sl.position.set(l.x, l.y, l.z);
				if (!sl.visible || moved || refresh) {
					sl.shadow.needsUpdate = true;
				}
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
