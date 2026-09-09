import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface Xform {
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
	key: keyof Xform;
	label: string;
	min: number;
	max: number;
	step: number;
}> = [
	{ key: 'px', label: 'pos x', min: -0.5, max: 0.5, step: 0.005 },
	{ key: 'py', label: 'pos y', min: -0.5, max: 0.5, step: 0.005 },
	{ key: 'pz', label: 'pos z', min: -0.5, max: 0.5, step: 0.005 },
	{ key: 'rx', label: 'rot x', min: -PI, max: PI, step: 0.02 },
	{ key: 'ry', label: 'rot y', min: -PI, max: PI, step: 0.02 },
	{ key: 'rz', label: 'rot z', min: -PI, max: PI, step: 0.02 },
	{ key: 'scale', label: 'scale', min: 0.05, max: 3, step: 0.01 },
];

interface Vm {
	scene: THREE.Object3D;
}

function findPivot(): THREE.Object3D | null {
	const vm = (window as unknown as { __vm?: Vm }).__vm;
	if (!vm) return null;
	let found: THREE.Object3D | null = null;
	vm.scene.traverse((o) => {
		if (o.userData.heldPivot) found = o;
	});
	return found;
}

function read(pivot: THREE.Object3D): Xform {
	return {
		px: pivot.position.x,
		py: pivot.position.y,
		pz: pivot.position.z,
		rx: pivot.rotation.x,
		ry: pivot.rotation.y,
		rz: pivot.rotation.z,
		scale: pivot.scale.x,
	};
}

function apply(pivot: THREE.Object3D, g: Xform): void {
	pivot.position.set(g.px, g.py, g.pz);
	pivot.rotation.set(g.rx, g.ry, g.rz);
	pivot.scale.setScalar(g.scale);
}

export function HeldGripDebug() {
	const [g, setG] = useState<Xform>({
		px: 0,
		py: 0,
		pz: 0,
		rx: 0,
		ry: 0,
		rz: 0,
		scale: 1,
	});
	const [name, setName] = useState<string>('—');
	const gRef = useRef(g);
	const pivotRef = useRef<THREE.Object3D | null>(null);
	useEffect(() => {
		gRef.current = g;
	});

	useEffect(() => {
		const id = setInterval(() => {
			const pivot = findPivot();
			if (!pivot) {
				pivotRef.current = null;
				return;
			}
			if (pivot !== pivotRef.current) {
				pivotRef.current = pivot;
				setName(pivot.name || 'held');
				setG(read(pivot));
			} else {
				apply(pivot, gRef.current);
			}
		}, 150);
		return () => clearInterval(id);
	}, []);

	const set = (key: keyof Xform, v: number) => {
		setG((p) => {
			const next = { ...p, [key]: v };
			if (pivotRef.current) apply(pivotRef.current, next);
			return next;
		});
	};

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
			<div style={{ marginBottom: 10, opacity: 0.7 }}>
				held grip · {name}
			</div>
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
						`[grip] ${name} =`,
						JSON.stringify({
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
