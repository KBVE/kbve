import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getDungeon } from '../dungeon/store';
import { Health, Npc, Transform3, hasComponent, isAlive } from '../mecs/props';
import { getTarget } from '../combat/targeting';
import { NPC_GOBLIN, NPC_KURENAI } from './goblinSim';

const BAR_W = 0.62;
const BAR_H = 0.08;
const BORDER = 0.016;
const DEFAULT_HEAD_H = 1.8;
const HEAD_H: Record<number, number> = {
	[NPC_GOBLIN]: 1.5,
	[NPC_KURENAI]: 2.3,
};
const LAG_SPEED = 0.85;
const FLASH_DECAY = 7;

const WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();

function colorFor(frac: number): number {
	if (frac > 0.5) return 0x5fbf4a;
	if (frac > 0.25) return 0xd8c23a;
	return 0xc43a2a;
}

function leftAnchor(mesh: THREE.Mesh, frac: number): void {
	mesh.scale.x = frac;
	mesh.position.x = -(BAR_W * (1 - frac)) / 2;
}

export function EnemyHealthBars() {
	const { camera } = useThree();
	const st = useRef({ eid: -1, lag: 1, flash: 0, lastHp: 0 });

	const { group, fg, fgMat, trail } = useMemo(() => {
		const g = new THREE.Group();
		g.visible = false;
		const bgGeo = new THREE.PlaneGeometry(
			BAR_W + BORDER * 2,
			BAR_H + BORDER * 2,
		);
		const barGeo = new THREE.PlaneGeometry(BAR_W, BAR_H);
		const bg = new THREE.Mesh(
			bgGeo,
			new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false }),
		);
		bg.renderOrder = 9997;
		bg.frustumCulled = false;
		const trailMesh = new THREE.Mesh(
			barGeo,
			new THREE.MeshBasicMaterial({ color: 0xe8dcc0, depthTest: false }),
		);
		trailMesh.position.z = 0.0005;
		trailMesh.renderOrder = 9998;
		trailMesh.frustumCulled = false;
		const fgMaterial = new THREE.MeshBasicMaterial({
			color: 0x5fbf4a,
			depthTest: false,
		});
		const fgMesh = new THREE.Mesh(barGeo, fgMaterial);
		fgMesh.position.z = 0.001;
		fgMesh.renderOrder = 9999;
		fgMesh.frustumCulled = false;
		g.add(bg, trailMesh, fgMesh);
		return { group: g, fg: fgMesh, fgMat: fgMaterial, trail: trailMesh };
	}, []);

	useFrame((_, dt) => {
		const world = getDungeon().world;
		const eid = getTarget() ?? -1;
		const valid =
			eid >= 0 &&
			isAlive(world, eid) &&
			hasComponent(world, eid, Health) &&
			Health.maxHp[eid] > 0 &&
			Health.hp[eid] > 0;
		if (!valid) {
			group.visible = false;
			st.current.eid = -1;
			return;
		}

		const hp = Health.hp[eid];
		const frac = Math.min(1, hp / Health.maxHp[eid]);
		const s = st.current;
		if (s.eid !== eid) {
			s.eid = eid;
			s.lag = frac;
			s.flash = 0;
			s.lastHp = hp;
		}
		if (hp < s.lastHp) s.flash = 1;
		s.lastHp = hp;
		s.lag = frac < s.lag ? Math.max(frac, s.lag - LAG_SPEED * dt) : frac;
		s.flash = Math.max(0, s.flash - FLASH_DECAY * dt);

		group.position.set(
			Transform3.px[eid],
			Transform3.py[eid] +
				(hasComponent(world, eid, Npc)
					? (HEAD_H[Npc.kind[eid]] ?? DEFAULT_HEAD_H)
					: DEFAULT_HEAD_H),
			Transform3.pz[eid],
		);
		group.quaternion.copy(camera.quaternion);
		group.visible = true;
		leftAnchor(trail, s.lag);
		leftAnchor(fg, frac);
		_c.setHex(colorFor(frac)).lerp(WHITE, s.flash);
		fgMat.color.copy(_c);
	});

	return <primitive object={group} />;
}
