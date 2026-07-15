import * as THREE from 'three';
import { Water } from './vendor/Water';
import { CausticsPass } from './vendor/CausticsPass';
import { PoolPass } from './vendor/PoolPass';
import { WaterSurfacePass } from './vendor/WaterSurfacePass';
import { WaterOpticsState } from './vendor/WaterOpticsState';
import { ObjectTexturePass } from './vendor/ObjectTexturePass';
import { OASIS_CORNER_RADIUS, OASIS_DEPTH, SURFACE_DROP } from './constants';
import { drainDisturbs, type OasisDef } from './oasis';

const LIGHT_DIR = new THREE.Vector3(1.4, 2, -0.8).normalize();
const CAUSTICS_SIZE = 1024;

let sharedObjectTextures: ObjectTexturePass | null = null;

function objectTextures(renderer: THREE.WebGLRenderer): ObjectTexturePass {
	if (!sharedObjectTextures) {
		sharedObjectTextures = new ObjectTexturePass(renderer, LIGHT_DIR);
	}
	return sharedObjectTextures;
}

export class OasisInstance {
	readonly group = new THREE.Group();
	private readonly water: Water;
	private readonly caustics: CausticsPass;
	private readonly pool: PoolPass;
	private readonly surface: WaterSurfacePass;
	private readonly optics: WaterOpticsState;
	private readonly otp: ObjectTexturePass;
	private readonly localEye = new THREE.Vector3();
	private readonly depth = OASIS_DEPTH - SURFACE_DROP;
	private primed = false;

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		readonly def: OasisDef,
		tiles: THREE.Texture,
		sky: THREE.CubeTexture,
	) {
		this.optics = new WaterOpticsState();
		this.optics.lightDirection.copy(LIGHT_DIR);
		this.otp = objectTextures(renderer);
		this.water = new Water(renderer, 512, THREE.LinearFilter);
		this.caustics = new CausticsPass(
			renderer,
			this.optics,
			this.otp.shadowTarget.texture,
			CAUSTICS_SIZE,
		);
		this.pool = new PoolPass(
			tiles,
			this.caustics.texture,
			this.optics,
			SURFACE_DROP,
		);
		this.surface = new WaterSurfacePass(
			tiles,
			sky,
			this.caustics.texture,
			this.otp.reflectionTarget.texture,
			this.otp.clippedReflectionTarget.texture,
			this.otp.refractionTarget.texture,
			this.optics,
		);
		const r = OASIS_CORNER_RADIUS;
		this.pool.setPoolShape('Rounded', r, def.halfW, this.depth, def.halfL);
		this.caustics.setPoolShape(
			'Rounded',
			r,
			def.halfW,
			this.depth,
			def.halfL,
		);
		this.surface.setPoolShape(
			'Rounded',
			r,
			def.halfW,
			this.depth,
			def.halfL,
		);
		this.otp.setPoolBounds(def.halfW, def.halfL);

		this.group.position.set(def.cx, def.surfaceY, def.cz);
		this.group.add(
			this.pool.mesh,
			this.surface.aboveMesh,
			this.surface.belowMesh,
		);
	}

	update(camera: THREE.Camera): void {
		const def = this.def;
		for (const d of drainDisturbs(def.id)) {
			if (d.kind === 'drop') {
				this.water.addDrop(
					(d.x - def.cx) / def.halfW,
					(d.z - def.cz) / def.halfL,
					d.radius / (2 * def.halfL),
					d.strength,
					def.halfW,
					def.halfL,
				);
			} else {
				this.water.moveSphere(
					new THREE.Vector3(d.ox - def.cx, d.y, d.oz - def.cz),
					new THREE.Vector3(d.nx - def.cx, d.y, d.nz - def.cz),
					d.radius,
					0.6,
					def.halfW,
					def.halfL,
				);
			}
		}
		this.water.stepSimulation(def.halfW, def.halfL);
		this.water.stepSimulation(def.halfW, def.halfL);
		this.water.updateNormals(def.halfW, def.halfL);
		this.caustics.update(this.water);
		this.prepare(camera);
	}

	prepare(camera: THREE.Camera): void {
		if (!this.primed) {
			this.primed = true;
			this.water.updateNormals(this.def.halfW, this.def.halfL);
			this.caustics.update(this.water);
			this.otp.update(
				new THREE.Scene(),
				camera as THREE.PerspectiveCamera,
				null,
			);
		}
		camera.getWorldPosition(this.localEye).sub(this.group.position);
		this.pool.prepare(this.water);
		this.surface.prepare(this.water, this.localEye, {
			viewProjectionMatrix: this.otp.viewProjectionMatrix,
			reflectionViewProjectionMatrix:
				this.otp.reflectionViewProjectionMatrix,
		});
	}

	setVisible(on: boolean, eyeY: number): void {
		this.group.visible = on;
		if (on) this.surface.belowMesh.visible = eyeY < this.def.surfaceY;
	}

	dispose(): void {
		this.water.textureA.dispose();
		this.water.textureB.dispose();
		this.caustics.dispose();
		this.pool.dispose();
		this.surface.dispose();
		this.group.removeFromParent();
	}
}
