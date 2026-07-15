import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { getDungeon } from '../dungeon/store';
import { Health, Npc, Transform3, isAlive, query } from '../mecs/props';
import { NPC_GOBLIN, NPC_KURENAI } from './goblinSim';

const MAX_BARS = 24;
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

const NPC_TERMS = [Npc, Health, Transform3];
const WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();

function colorFor(frac: number): number {
	if (frac > 0.5) return 0x5fbf4a;
	if (frac > 0.25) return 0xd8c23a;
	return 0xc43a2a;
}

interface Bar {
	group: THREE.Group;
	fg: THREE.Mesh;
	fgMat: THREE.MeshBasicMaterial;
	trail: THREE.Mesh;
}

interface HpState {
	lag: number;
	flash: number;
	lastHp: number;
}

function leftAnchor(mesh: THREE.Mesh, frac: number): void {
	mesh.scale.x = frac;
	mesh.position.x = -(BAR_W * (1 - frac)) / 2;
}

export function EnemyHealthBars() {
	const { camera } = useThree();
	const root = useRef<THREE.Group>(null);
	const state = useRef(new Map<number, HpState>());
	const seen = useRef(new Set<number>());

	const bars = useMemo<Bar[]>(() => {
		const bgGeo = new THREE.PlaneGeometry(
			BAR_W + BORDER * 2,
			BAR_H + BORDER * 2,
		);
		const barGeo = new THREE.PlaneGeometry(BAR_W, BAR_H);
		const bgMat = new THREE.MeshBasicMaterial({
			color: 0x000000,
			depthTest: false,
		});
		const trailMat = new THREE.MeshBasicMaterial({
			color: 0xe8dcc0,
			depthTest: false,
		});
		const out: Bar[] = [];
		for (let i = 0; i < MAX_BARS; i++) {
			const g = new THREE.Group();
			g.visible = false;
			const bg = new THREE.Mesh(bgGeo, bgMat);
			bg.renderOrder = 9997;
			bg.frustumCulled = false;
			const trail = new THREE.Mesh(barGeo, trailMat);
			trail.position.z = 0.0005;
			trail.renderOrder = 9998;
			trail.frustumCulled = false;
			const fgMat = new THREE.MeshBasicMaterial({
				color: 0x5fbf4a,
				depthTest: false,
			});
			const fg = new THREE.Mesh(barGeo, fgMat);
			fg.position.z = 0.001;
			fg.renderOrder = 9999;
			fg.frustumCulled = false;
			g.add(bg, trail, fg);
			out.push({ group: g, fg, fgMat, trail });
		}
		return out;
	}, []);

	useFrame((_, dt) => {
		if (!root.current) return;
		const world = getDungeon().world;
		const eids = query(world, NPC_TERMS);
		const map = state.current;
		const live = seen.current;
		live.clear();
		let n = 0;
		for (const eid of eids) {
			if (n >= MAX_BARS) break;
			if (!isAlive(world, eid)) continue;
			const max = Health.maxHp[eid];
			const hp = Health.hp[eid];
			if (max <= 0 || hp <= 0) continue;
			const frac = Math.min(1, hp / max);
			live.add(eid);

			let st = map.get(eid);
			if (!st) {
				st = { lag: frac, flash: 0, lastHp: hp };
				map.set(eid, st);
			}
			if (hp < st.lastHp) st.flash = 1;
			st.lastHp = hp;
			st.lag =
				frac < st.lag ? Math.max(frac, st.lag - LAG_SPEED * dt) : frac;
			st.flash = Math.max(0, st.flash - FLASH_DECAY * dt);

			const bar = bars[n++];
			const g = bar.group;
			g.position.set(
				Transform3.px[eid],
				Transform3.py[eid] + (HEAD_H[Npc.kind[eid]] ?? DEFAULT_HEAD_H),
				Transform3.pz[eid],
			);
			g.quaternion.copy(camera.quaternion);
			g.visible = true;
			leftAnchor(bar.trail, st.lag);
			leftAnchor(bar.fg, frac);
			_c.setHex(colorFor(frac)).lerp(WHITE, st.flash);
			bar.fgMat.color.copy(_c);
		}
		for (let i = n; i < MAX_BARS; i++) bars[i].group.visible = false;
		if (map.size > live.size)
			for (const eid of map.keys()) if (!live.has(eid)) map.delete(eid);
	});

	return (
		<group ref={root}>
			{bars.map((b, i) => (
				<primitive key={i} object={b.group} />
			))}
		</group>
	);
}
