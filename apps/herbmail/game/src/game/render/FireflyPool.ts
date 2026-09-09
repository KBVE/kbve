import * as THREE from 'three';
import { EntityPool } from '../mecs/pool';
import { Transform3 } from '../mecs/props';
import { FireflyFx } from '../prop/components';

const BASE_SCALE = 0.34;
const PULSE = 0.12;

function makeDotTexture(): THREE.Texture {
	const size = 64;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const g = ctx.createRadialGradient(
		size / 2,
		size / 2,
		0,
		size / 2,
		size / 2,
		size / 2,
	);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(190,255,150,0.85)');
	g.addColorStop(1, 'rgba(120,255,110,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

const DOT_TEX = makeDotTexture();

interface FireflyItem {
	sprite: THREE.Sprite;
	seed: number;
}

// Pooled additive glow billboards keyed by firefly entities. THREE.Sprite handles
// camera-facing; tick copies the integrated Transform3 position and pulses scale +
// opacity so each firefly softly throbs out of phase with its neighbours.
export class FireflyPool extends EntityPool<FireflyItem> {
	readonly root = new THREE.Group();

	constructor() {
		super([FireflyFx, Transform3]);
	}

	protected create(eid: number): FireflyItem {
		const mat = new THREE.SpriteMaterial({
			map: DOT_TEX,
			color: 0xbfff8a,
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthWrite: false,
			depthTest: true,
		});
		const sprite = new THREE.Sprite(mat);
		sprite.scale.setScalar(BASE_SCALE);
		sprite.position.set(
			Transform3.px[eid],
			Transform3.py[eid],
			Transform3.pz[eid],
		);
		sprite.renderOrder = 12;
		this.root.add(sprite);
		return { sprite, seed: FireflyFx.seed[eid] };
	}

	protected destroy(item: FireflyItem): void {
		this.root.remove(item.sprite);
		item.sprite.material.dispose();
	}

	tick(time: number): void {
		for (const [eid, it] of this.entries()) {
			it.sprite.position.set(
				Transform3.px[eid],
				Transform3.py[eid],
				Transform3.pz[eid],
			);
			const pulse = 0.85 + PULSE * Math.sin(time * 4.0 + it.seed * 5.1);
			it.sprite.scale.setScalar(BASE_SCALE * pulse);
			it.sprite.material.opacity = 0.6 + 0.4 * pulse;
		}
	}
}
