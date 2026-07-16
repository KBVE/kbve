import * as THREE from 'three';
import {
	hasComponent,
	LightEmitter,
	eachOwned,
	Transform3,
	type World,
} from '../mecs/props';
import { FireflyFx } from '../prop/components';
import { MAX_LIGHTS, LIGHT_RANGE, psxMaterialRegistry } from './PsxMaterial';
import type { OcclusionField } from '../dungeon/occlusion';
import { heldLight } from './heldLight';
import { playerAnchor } from './playerAnchor';
import { bodyMotionSig } from '../dungeon/collision';
import { getOases } from '../water/oasis';
import { VIEW_RANGE, WALL_H } from '../config';

const HEAD_REACH = 1.122;
const HEAD_OFFSET = 0.28;
// Consider any emitter within visible range: a torch you could see (out to the fog
// wall, plus its own LIGHT_RANGE glow radius) must still be fed to the shader.
const CULL_RADIUS = VIEW_RANGE + LIGHT_RANGE;
const CULL_SQ = CULL_RADIUS * CULL_RADIUS;
const POINT_LIGHTS = 6;
const POINT_SCALE = 3.0;
// Caster handoff: challenger torch must be this fraction of the current
// caster's squared player distance to steal the role (hysteresis), and the
// shadow fades out/in over FADE_TIME on each swap instead of popping.
const SWAP_RATIO = 0.55;
const FADE_TIME = 0.18;
const SHADOW_CASTERS = 2;
const SHADOW_MOVE_EPS = 0.02;
// Static sky-light that fills an oasis room — the "sun pooling in" through the
// oculus, fed through the same shader path as torches so it lights the walls.
const OASIS_LIGHT_INTENSITY = 2.2;
const OASIS_LIGHT_Y = WALL_H * 0.5;
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
interface ShadowSlot {
	light: THREE.PointLight;
	pos: THREE.Vector3 | null;
	pending: THREE.Vector3;
	hasPending: boolean;
	fade: number;
}

export class LightSystem {
	readonly root = new THREE.Group();
	private readonly lights: THREE.PointLight[] = [];
	private readonly slots: ShadowSlot[] = [];
	private lastTime = 0;
	private frame = 0;
	private lastShadowSig = 0;
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
			// Stay visible for the shader's whole life: toggling light.visible (or
			// count) re-hashes the renderer's lights and recompiles every
			// light-using program. Inactive lights sit at intensity 0 instead.
			pl.visible = true;
			this.lights.push(pl);
			this.root.add(pl);
		}
		for (let i = 0; i < SHADOW_CASTERS; i++) {
			const sl = new THREE.PointLight(0xffffff, 0, LIGHT_RANGE, 2);
			sl.castShadow = true;
			sl.visible = true;
			sl.shadow.intensity = 0;
			sl.shadow.autoUpdate = false;
			sl.shadow.mapSize.set(256, 256);
			sl.shadow.camera.near = 0.2;
			sl.shadow.camera.far = LIGHT_RANGE;
			sl.shadow.bias = -0.005;
			sl.shadow.radius = 4;
			this.slots.push({
				light: sl,
				pos: null,
				pending: new THREE.Vector3(),
				hasPending: false,
				fade: 0,
			});
			this.root.add(sl);
		}
	}

	tick(
		world: World,
		mounted: readonly number[],
		camera: THREE.Camera,
		time: number,
		occ: OcclusionField,
		ambient: number,
	): void {
		this.active.length = 0;
		const gather = (eid: number) => {
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
		};
		for (const sector of mounted) eachOwned(sector, LIGHT_TERMS, gather);

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

		// Static sky-light per oasis: a bright, warm, non-flickering source at the
		// room centre so the open room reads as daylit. tier -1 keeps it ahead of
		// torches in the nearest-N cut when the player is inside.
		for (const o of getOases()) {
			const pdx = o.cx - playerAnchor.pos.x;
			const pdz = o.cz - playerAnchor.pos.z;
			const pd2 = pdx * pdx + pdz * pdz;
			if (pd2 > CULL_SQ) continue;
			const ddx = o.cx - camera.position.x;
			const ddz = o.cz - camera.position.z;
			const l = this.take();
			l.x = o.cx;
			l.y = OASIS_LIGHT_Y;
			l.z = o.cz;
			l.r = 1.0;
			l.g = 0.93;
			l.b = 0.78;
			l.dist = ddx * ddx + ddz * ddz;
			l.pdist = pd2;
			l.intensity = OASIS_LIGHT_INTENSITY;
			l.tier = -1;
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
			} else {
				pl.intensity = 0;
			}
		}

		const dt = Math.min(Math.max(time - this.lastTime, 0), 0.1);
		this.lastTime = time;
		this.updateShadowCasters(dt);
	}

	// The two nearest torches own the cube shadow casters. A slot keeps its
	// torch until it clearly loses the ranking (SWAP_RATIO hysteresis), and
	// every handoff crossfades shadow.intensity so shadows tween between
	// torches instead of popping as the player walks.
	private updateShadowCasters(dt: number): void {
		let a: Ranked | null = null;
		let b: Ranked | null = null;
		for (const l of this.active) {
			if (l.tier !== 0) continue;
			if (!a || l.pdist < a.pdist) {
				b = a;
				a = l;
			} else if (!b || l.pdist < b.pdist) {
				b = l;
			}
		}
		const top: Ranked[] = [];
		if (a) top.push(a);
		if (b) top.push(b);

		const claimed = new Set<Ranked>();
		for (const slot of this.slots) {
			if (!slot.pos) continue;
			const match = top.find(
				(t) =>
					!claimed.has(t) &&
					t.x === slot.pos!.x &&
					t.y === slot.pos!.y &&
					t.z === slot.pos!.z,
			);
			if (match) claimed.add(match);
		}

		this.frame++;
		// Only re-render shadow maps when a dynamic occluder actually moved
		// (player/goblins/props). A static scene skips the six-face cube render
		// entirely instead of paying it every third frame. A rare safety tick
		// covers anything that mutates geometry without touching a Body.
		const sig = bodyMotionSig();
		const occluderMoved =
			Math.abs(sig - this.lastShadowSig) > SHADOW_MOVE_EPS;
		if (occluderMoved) this.lastShadowSig = sig;
		const refresh = occluderMoved || this.frame % 90 === 0;

		for (const slot of this.slots) {
			const cur = slot.pos;
			const held = cur
				? top.find(
						(t) => t.x === cur.x && t.y === cur.y && t.z === cur.z,
					)
				: undefined;
			if (!held) {
				const free = top.find((t) => !claimed.has(t));
				if (free) {
					claimed.add(free);
					if (!cur) {
						slot.pos = new THREE.Vector3(free.x, free.y, free.z);
						slot.fade = 0;
						slot.hasPending = false;
					} else {
						const cx = cur.x - playerAnchor.pos.x;
						const cz = cur.z - playerAnchor.pos.z;
						const curDist = cx * cx + cz * cz;
						if (free.pdist < curDist * SWAP_RATIO) {
							slot.pending.set(free.x, free.y, free.z);
							slot.hasPending = true;
						}
					}
				} else if (cur) {
					slot.hasPending = false;
					slot.fade = Math.max(0, slot.fade - dt / FADE_TIME);
					if (slot.fade === 0) slot.pos = null;
				}
			}

			const sl = slot.light;
			if (!slot.pos) {
				sl.shadow.intensity = 0;
				continue;
			}
			if (slot.hasPending) {
				slot.fade -= dt / FADE_TIME;
				if (slot.fade <= 0) {
					slot.fade = 0;
					slot.pos.copy(slot.pending);
					slot.hasPending = false;
				}
			} else if (!held && slot.fade > 0) {
				// fading out handled above
			} else {
				slot.fade = Math.min(1, slot.fade + dt / FADE_TIME);
			}

			const moved =
				sl.position.x !== slot.pos.x ||
				sl.position.y !== slot.pos.y ||
				sl.position.z !== slot.pos.z;
			sl.position.copy(slot.pos);
			const wasDark = sl.shadow.intensity === 0;
			sl.shadow.intensity = slot.fade;
			const show = slot.fade > 0;
			if (show && (wasDark || moved || refresh)) {
				sl.shadow.needsUpdate = true;
			}
		}
	}

	dispose(): void {
		for (const pl of this.lights) this.root.remove(pl);
		for (const slot of this.slots) {
			slot.light.shadow.map?.dispose();
			this.root.remove(slot.light);
		}
	}
}
