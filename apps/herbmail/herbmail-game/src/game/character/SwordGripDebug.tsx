import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WEAPON_GRIP } from './weaponGrip';

interface Grip {
	gripY: number;
	px: number;
	py: number;
	pz: number;
	rx: number;
	ry: number;
	rz: number;
	scale: number;
}

const PI = Math.PI;

const rows: Array<{
	key: keyof Grip;
	label: string;
	min: number;
	max: number;
	step: number;
}> = [
	{ key: 'gripY', label: 'gripY', min: 0, max: 1, step: 0.005 },
	{ key: 'px', label: 'pos x', min: -0.4, max: 0.4, step: 0.005 },
	{ key: 'py', label: 'pos y', min: -0.4, max: 0.4, step: 0.005 },
	{ key: 'pz', label: 'pos z', min: -0.4, max: 0.4, step: 0.005 },
	{ key: 'rx', label: 'rot x', min: -PI, max: PI, step: 0.02 },
	{ key: 'ry', label: 'rot y', min: -PI, max: PI, step: 0.02 },
	{ key: 'rz', label: 'rot z', min: -PI, max: PI, step: 0.02 },
	{ key: 'scale', label: 'scale', min: 0.2, max: 3, step: 0.02 },
];

function findPivot(): THREE.Object3D | null {
	const vm = (window as unknown as { __vm?: { scene: THREE.Object3D } }).__vm;
	if (!vm) return null;
	let found: THREE.Object3D | null = null;
	vm.scene.traverse((o) => {
		if (o.name === 'weaponPivot') found = o;
	});
	return found;
}

function apply(g: Grip): void {
	const pivot = findPivot();
	if (!pivot) return;
	pivot.position.set(g.px, g.py, g.pz);
	pivot.rotation.set(g.rx, g.ry, g.rz);
	pivot.scale.setScalar(g.scale);
	const inner = pivot.children[0];
	if (inner) inner.position.y = -g.gripY;
}

export function SwordGripDebug() {
	const s = WEAPON_GRIP.sword;
	const [g, setG] = useState<Grip>({
		gripY: s.gripY,
		px: s.pos[0],
		py: s.pos[1],
		pz: s.pos[2],
		rx: s.rot[0],
		ry: s.rot[1],
		rz: s.rot[2],
		scale: s.scale,
	});
	const gRef = useRef(g);

	useEffect(() => {
		gRef.current = g;
		apply(g);
	}, [g]);

	// re-apply after a (re)equip remounts the sword
	useEffect(() => {
		const id = setInterval(() => apply(gRef.current), 500);
		return () => clearInterval(id);
	}, []);

	const set = (key: keyof Grip, v: number) =>
		setG((p) => ({ ...p, [key]: v }));

	return (
		<div
			style={{
				position: 'fixed',
				top: 12,
				right: 12,
				padding: '12px 14px',
				background: 'rgba(10,10,14,0.92)',
				border: '1px solid #3a3a44',
				borderRadius: 8,
				color: '#c9c9d6',
				font: '12px monospace',
				pointerEvents: 'auto',
				userSelect: 'none',
				width: 300,
				zIndex: 10,
			}}>
			<div style={{ marginBottom: 10, opacity: 0.7 }}>sword grip</div>
			{rows.map((r) => (
				<div key={r.key} style={{ marginBottom: 12 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 4,
						}}>
						<span style={{ width: 46 }}>{r.label}</span>
						<input
							type="number"
							value={g[r.key]}
							step={r.step}
							onChange={(e) => set(r.key, Number(e.target.value))}
							style={{
								width: 70,
								background: '#16161c',
								color: '#e8e8f0',
								border: '1px solid #3a3a44',
								borderRadius: 4,
								padding: '3px 5px',
								font: '12px monospace',
							}}
						/>
					</div>
					<input
						type="range"
						min={r.min}
						max={r.max}
						step={r.step}
						value={g[r.key]}
						onChange={(e) => set(r.key, Number(e.target.value))}
						style={{ width: '100%', height: 22 }}
					/>
				</div>
			))}
			<button
				type="button"
				onClick={() =>
					console.info(
						'[grip] sword =',
						JSON.stringify({
							gripY: +g.gripY.toFixed(3),
							pos: [
								+g.px.toFixed(3),
								+g.py.toFixed(3),
								+g.pz.toFixed(3),
							],
							rot: [
								+g.rx.toFixed(3),
								+g.ry.toFixed(3),
								+g.rz.toFixed(3),
							],
							scale: +g.scale.toFixed(3),
						}),
					)
				}
				style={{
					width: '100%',
					marginTop: 4,
					padding: '6px',
					background: '#22323a',
					color: '#cfe',
					border: '1px solid #3a5a66',
					borderRadius: 5,
					font: '12px monospace',
					cursor: 'pointer',
				}}>
				log grip to console
			</button>
		</div>
	);
}
