import { useMemo } from 'react';
import * as THREE from 'three';
import { POOL_DEPTH } from './constants';
import { useOases, type OasisDef } from './pools';

const LEVELS: { y: (p: OasisDef) => number; color: number; label: string }[] = [
	{ y: () => 0, color: 0xffdd44, label: 'rim' },
	{ y: (p) => p.surfaceY, color: 0x44ddff, label: 'surface' },
	{ y: () => -POOL_DEPTH, color: 0xff4455, label: 'floor' },
];

function rectGeo(p: OasisDef, y: number): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setFromPoints([
		new THREE.Vector3(p.x0, y, p.z0),
		new THREE.Vector3(p.x1, y, p.z0),
		new THREE.Vector3(p.x1, y, p.z1),
		new THREE.Vector3(p.x0, y, p.z1),
	]);
	return g;
}

export function OasisLevelsDebug() {
	const pools = useOases();
	const loops = useMemo(
		() =>
			pools.flatMap((p) =>
				LEVELS.map((l) => ({
					key: `${p.id}:${l.label}`,
					geo: rectGeo(p, l.y(p)),
					mat: new THREE.LineBasicMaterial({
						color: l.color,
						depthTest: false,
					}),
				})),
			),
		[pools],
	);
	return (
		<>
			{loops.map((l) => (
				<lineLoop
					key={l.key}
					geometry={l.geo}
					material={l.mat}
					renderOrder={20}
				/>
			))}
		</>
	);
}
