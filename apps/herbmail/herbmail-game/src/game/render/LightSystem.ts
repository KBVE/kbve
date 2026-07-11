import * as THREE from 'three';
import { LightEmitter, query, Transform3, type World } from '@kbve/laser/ecs';
import { MAX_LIGHTS, LIGHT_RANGE } from '../PsxMaterial';
import type { OcclusionField } from '../dungeon/occlusion';

const HEAD_REACH = 1.122;
const HEAD_OFFSET = 0.28;
const POINT_LIGHTS = 6;
const POINT_SCALE = 3.0;

interface Ranked {
	x: number;
	y: number;
	z: number;
	r: number;
	g: number;
	b: number;
	dist: number;
	intensity: number;
}

// Reads all LightEmitter props each frame, ranks them by camera distance, and
// feeds the nearest MAX_LIGHTS into the PSX shader uniforms plus the nearest
// POINT_LIGHTS real point lights (for standard-material meshes the shader misses).
// Ported from the retired TorchLighting component.
export class LightSystem {
	readonly root = new THREE.Group();
	private readonly lights: THREE.PointLight[] = [];
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
			const dx = Transform3.dx[eid];
			const dy = Transform3.dy[eid];
			const dz = Transform3.dz[eid];
			const len = Math.hypot(dx, dy, dz) || 1;
			const x = Transform3.px[eid] + (dx / len) * HEAD_REACH;
			const y =
				Transform3.py[eid] + (dy / len) * HEAD_REACH + HEAD_OFFSET;
			const z = Transform3.pz[eid] + (dz / len) * HEAD_REACH;

			const ph = LightEmitter.flickerPhase[eid];
			const amp = LightEmitter.flickerAmp[eid];
			const f =
				0.85 +
				amp *
					(0.08 * Math.sin(time * 2.1 + ph) +
						0.05 * Math.sin(time * 3.7 + ph * 1.7) +
						0.025 * Math.sin(time * 6.3 + ph * 2.3));

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
				intensity: LightEmitter.baseIntensity[eid] * f,
			});
		}
		this.ranked.sort((a, b) => a.dist - b.dist);
		const count = Math.min(this.ranked.length, MAX_LIGHTS);

		for (let i = 0; i < count; i++) {
			const l = this.ranked[i];
			this.pos[i].set(l.x, l.y, l.z);
			this.col[i].set(l.r, l.g, l.b).multiplyScalar(l.intensity);
		}

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
			(u.uLightPos.value as THREE.Vector3[]).forEach((v, i) =>
				v.copy(this.pos[i]),
			);
			(u.uLightColor.value as THREE.Vector3[]).forEach((v, i) =>
				v.copy(this.col[i]),
			);
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
	}

	dispose(): void {
		for (const pl of this.lights) this.root.remove(pl);
	}
}
