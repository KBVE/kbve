import {
	addComponent,
	LightEmitter,
	eachOwned,
	Transform3,
	type World,
} from '../mecs/props';
import { playerAnchor } from '../render/playerAnchor';
import { FireflyFx } from './components';
import { PROP_FIREFLY } from './kinds';
import { spawnPropBase } from './base';
import { applyLight, LIGHT_PRESETS } from './lights';

const FLY_TERMS = [FireflyFx, Transform3];

const BOB_R = 0.35;
const BOB_Y = 0.28;
const FLEE_RADIUS = 3.0;
const FLEE_ACCEL = 22;
const SPRING = 5.5;
const DAMP = 3.6;
const MAX_SPEED = 7;

export function spawnFirefly(
	world: World,
	ownerEid: number,
	home: [number, number, number],
	seed: number,
): number {
	const eid = spawnPropBase(world, PROP_FIREFLY, ownerEid, home, [0, 1, 0]);

	FireflyFx.homeX[eid] = home[0];
	FireflyFx.homeY[eid] = home[1];
	FireflyFx.homeZ[eid] = home[2];
	FireflyFx.seed[eid] = seed;
	FireflyFx.vx[eid] = 0;
	FireflyFx.vy[eid] = 0;
	FireflyFx.vz[eid] = 0;
	applyLight(eid, LIGHT_PRESETS.firefly, seed);

	addComponent(world, eid, FireflyFx);
	addComponent(world, eid, LightEmitter);
	return eid;
}

export class FireflySystem {
	tick(
		_world: World,
		mounted: readonly number[],
		time: number,
		dt: number,
	): void {
		const step = Math.min(dt, 0.05);
		for (const sector of mounted)
			eachOwned(sector, FLY_TERMS, (eid) => {
				const s = FireflyFx.seed[eid];
				const tx =
					FireflyFx.homeX[eid] + Math.sin(time * 0.9 + s) * BOB_R;
				const ty =
					FireflyFx.homeY[eid] +
					Math.sin(time * 1.3 + s * 2.1) * BOB_Y;
				const tz =
					FireflyFx.homeZ[eid] +
					Math.cos(time * 0.75 + s * 1.7) * BOB_R;

				const px = Transform3.px[eid];
				const py = Transform3.py[eid];
				const pz = Transform3.pz[eid];

				let ax: number;
				let ay: number;
				let az: number;

				const fdx = px - playerAnchor.pos.x;
				const fdz = pz - playerAnchor.pos.z;
				const fd = Math.hypot(fdx, fdz);

				if (playerAnchor.on && fd < FLEE_RADIUS) {
					const k = (1 - fd / FLEE_RADIUS) * FLEE_ACCEL;
					const inv = fd > 0.001 ? 1 / fd : 0;
					ax = fdx * inv * k;
					az = fdz * inv * k;
					ay = k * 0.35;
				} else {
					ax = (tx - px) * SPRING;
					ay = (ty - py) * SPRING;
					az = (tz - pz) * SPRING;
				}

				let vx = (FireflyFx.vx[eid] + ax * step) * (1 - DAMP * step);
				let vy = (FireflyFx.vy[eid] + ay * step) * (1 - DAMP * step);
				let vz = (FireflyFx.vz[eid] + az * step) * (1 - DAMP * step);

				const sp = Math.hypot(vx, vy, vz);
				if (sp > MAX_SPEED) {
					const c = MAX_SPEED / sp;
					vx *= c;
					vy *= c;
					vz *= c;
				}

				FireflyFx.vx[eid] = vx;
				FireflyFx.vy[eid] = vy;
				FireflyFx.vz[eid] = vz;

				Transform3.px[eid] = px + vx * step;
				Transform3.py[eid] = py + vy * step;
				Transform3.pz[eid] = pz + vz * step;
			});
	}
}
