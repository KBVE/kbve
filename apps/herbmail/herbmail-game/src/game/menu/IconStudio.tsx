import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTER_URL } from '../character/modelUrl';
import { attachPartSet } from '../character/partsLoader';
import { ARMOR_PIECES, BODY_BASE, type ArmorPiece } from '../character/armor';
import { itemLabel } from '../data/itemdb';

const ICON_SIZE = 64;

function skinnedBox(mesh: THREE.SkinnedMesh, step = 7): THREE.Box3 {
	const box = new THREE.Box3();
	const v = new THREE.Vector3();
	const n = mesh.geometry.attributes.position.count;
	for (let i = 0; i < n; i += step) {
		mesh.getVertexPosition(i, v);
		box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
	}
	return box;
}

interface StageProps {
	piece: ArmorPiece;
	ghost: boolean;
	snapRequest: number;
	onSnapshot: (png: string) => void;
}

function Stage({ piece, ghost, snapRequest, onSnapshot }: StageProps) {
	const gltf = useGLTF(CHARACTER_URL);
	const { gl, scene: r3fScene, camera } = useThree();
	const controls = useRef<{
		enabled: boolean;
		target: THREE.Vector3;
		update: () => void;
	} | null>(null);
	const [ready, setReady] = useState(0);
	const drag = useRef<{
		mesh: THREE.Object3D;
		plane: THREE.Plane;
		start: THREE.Vector3;
		origin: THREE.Vector3;
	} | null>(null);

	const scene = useMemo(() => {
		const s = cloneSkinned(gltf.scene);
		s.traverse((o) => {
			const sk = o as THREE.SkinnedMesh;
			if (sk.isSkinnedMesh) sk.skeleton.pose();
		});
		return s;
	}, [gltf]);

	useEffect(() => {
		let live = true;
		attachPartSet(scene, piece.set).then(() => {
			if (live) setReady((n) => n + 1);
		});
		return () => {
			live = false;
		};
	}, [scene, piece]);

	// Isolate the piece: only its meshes visible (plus the ghost mannequin),
	// flip them to detached bind so dragging their nodes moves the render.
	useEffect(() => {
		const owned: THREE.SkinnedMesh[] = [];
		scene.traverse((o) => {
			const m = o as THREE.SkinnedMesh;
			if (!m.isMesh) return;
			const isPiece = piece.slots.includes(m.name);
			m.visible = isPiece || (ghost && BODY_BASE.has(m.name));
			if (m.isSkinnedMesh) {
				if (isPiece) {
					m.updateMatrixWorld(true);
					m.bindMode = THREE.DetachedBindMode;
					m.bindMatrixInverse.copy(m.matrixWorld).invert();
					owned.push(m);
				}
				if (ghost && BODY_BASE.has(m.name) && !isPiece) {
					const mat = m.material as THREE.Material;
					if (!('__ghost' in mat)) {
						const g = mat.clone();
						g.transparent = true;
						g.opacity = 0.15;
						g.depthWrite = false;
						(g as THREE.Material & { __ghost?: boolean }).__ghost =
							true;
						m.material = g;
					}
				}
			}
		});
		for (const m of owned) m.position.set(0, 0, 0);

		// Auto-arrange spread pairs and frame the camera.
		scene.updateMatrixWorld(true);
		const boxes = owned.map((m) => skinnedBox(m));
		const sizes = boxes.map((b) => {
			const s = b.getSize(new THREE.Vector3());
			return Math.max(s.x, s.y, s.z);
		});
		const centers = boxes.map((b) => b.getCenter(new THREE.Vector3()));
		let spread = 0;
		for (const a of centers)
			for (const b of centers) spread = Math.max(spread, a.distanceTo(b));
		if (owned.length > 1 && spread > 1.5 * Math.max(...sizes)) {
			let x = 0;
			const anchor = centers[0];
			owned.forEach((m, i) => {
				const width = boxes[i].getSize(new THREE.Vector3()).x;
				const target = anchor.clone().add(new THREE.Vector3(x, 0, 0));
				m.position.add(target.sub(centers[i]));
				x += width * 1.1;
			});
			scene.updateMatrixWorld(true);
		}
		const all = new THREE.Box3();
		for (const m of owned) all.union(skinnedBox(m));
		if (!all.isEmpty()) {
			const center = all.getCenter(new THREE.Vector3());
			const size = all.getSize(new THREE.Vector3());
			const extent = Math.max(size.x, size.y, size.z, 0.05);
			const dir = new THREE.Vector3(1, 0.55, 1.4).normalize();
			camera.position.copy(center).addScaledVector(dir, extent * 2.1);
			camera.lookAt(center);
			controls.current?.target.copy(center);
			controls.current?.update();
		}
	}, [scene, piece, ghost, ready, camera]);

	// Offscreen 64x64 snapshot with alpha; ghost hidden for the capture.
	useEffect(() => {
		if (!snapRequest) return;
		const hidden: THREE.Object3D[] = [];
		scene.traverse((o) => {
			if (
				(o as THREE.Mesh).isMesh &&
				o.visible &&
				!piece.slots.includes(o.name)
			) {
				o.visible = false;
				hidden.push(o);
			}
		});
		const rt = new THREE.WebGLRenderTarget(ICON_SIZE, ICON_SIZE, {
			samples: 4,
			colorSpace: THREE.SRGBColorSpace,
		});
		const cam = (camera as THREE.PerspectiveCamera).clone();
		cam.aspect = 1;
		cam.updateProjectionMatrix();
		const prevBg = r3fScene.background;
		r3fScene.background = null;
		gl.setRenderTarget(rt);
		gl.render(r3fScene, cam);
		const pixels = new Uint8Array(ICON_SIZE * ICON_SIZE * 4);
		gl.readRenderTargetPixels(rt, 0, 0, ICON_SIZE, ICON_SIZE, pixels);
		gl.setRenderTarget(null);
		r3fScene.background = prevBg;
		rt.dispose();
		for (const o of hidden) o.visible = true;

		const cnv = document.createElement('canvas');
		cnv.width = ICON_SIZE;
		cnv.height = ICON_SIZE;
		const ctx = cnv.getContext('2d')!;
		const img = ctx.createImageData(ICON_SIZE, ICON_SIZE);
		for (let y = 0; y < ICON_SIZE; y++) {
			const src = (ICON_SIZE - 1 - y) * ICON_SIZE * 4;
			img.data.set(
				pixels.subarray(src, src + ICON_SIZE * 4),
				y * ICON_SIZE * 4,
			);
		}
		ctx.putImageData(img, 0, 0);
		onSnapshot(cnv.toDataURL('image/png'));
	}, [snapRequest]);

	const onDown = (e: ThreeEvent<PointerEvent>) => {
		let target: THREE.Object3D | null = e.object;
		while (target && !piece.slots.includes(target.name))
			target = target.parent;
		if (!target) return;
		e.stopPropagation();
		if (controls.current) controls.current.enabled = false;
		const normal = new THREE.Vector3();
		camera.getWorldDirection(normal);
		drag.current = {
			mesh: target,
			plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
				normal,
				e.point,
			),
			start: e.point.clone(),
			origin: target.position.clone(),
		};
		(e.target as Element).setPointerCapture(e.pointerId);
	};
	const onMove = (e: ThreeEvent<PointerEvent>) => {
		const d = drag.current;
		if (!d) return;
		const hit = new THREE.Vector3();
		e.ray.intersectPlane(d.plane, hit);
		d.mesh.position.copy(d.origin).add(hit.sub(d.start));
	};
	const onUp = () => {
		drag.current = null;
		if (controls.current) controls.current.enabled = true;
	};

	return (
		<>
			<ambientLight intensity={0.7} />
			<directionalLight position={[2, 4, 3]} intensity={1.6} />
			<directionalLight position={[-3, 2, -2]} intensity={0.5} />
			<primitive
				object={scene}
				onPointerDown={onDown}
				onPointerMove={onMove}
				onPointerUp={onUp}
			/>
			<OrbitControls ref={controls as never} makeDefault enablePan />
		</>
	);
}

interface Pending {
	ref: string;
	png: string;
}

export function IconStudio() {
	const [sel, setSel] = useState<ArmorPiece>(ARMOR_PIECES[0]);
	const [ghost, setGhost] = useState(false);
	const [snapRequest, setSnapRequest] = useState(0);
	const [pending, setPending] = useState<Pending | null>(null);
	const [bust, setBust] = useState(0);
	const [status, setStatus] = useState('');

	const iconUrl = (ref: string) => `/icons/items/${ref}.png?v=${bust}`;

	const replace = async () => {
		if (!pending) return;
		try {
			const res = await fetch('/__icon-studio', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(pending),
			});
			if (!res.ok) throw new Error(await res.text());
			const out = (await res.json()) as { written: string[] };
			setStatus(`wrote ${out.written.length} files: ${out.written[0]}…`);
			setBust((n) => n + 1);
		} catch {
			const a = document.createElement('a');
			a.href = pending.png;
			a.download = `${pending.ref}.png`;
			a.click();
			setStatus('dev endpoint unavailable — downloaded instead');
		}
		setPending(null);
	};

	return (
		<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
			<div style={{ width: 300, overflowY: 'auto', padding: '8px 0' }}>
				{ARMOR_PIECES.map((p) => {
					const active = p.id === sel.id;
					return (
						<div
							key={p.id}
							onClick={() => setSel(p)}
							style={{
								padding: '4px 16px',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								background: active
									? '#4a6a8a55'
									: 'transparent',
								borderLeft: active
									? '3px solid #7ab6ff'
									: '3px solid transparent',
							}}>
							<img
								src={iconUrl(p.id)}
								alt=""
								width={28}
								height={28}
								style={{ imageRendering: 'pixelated' }}
							/>
							<span>{itemLabel(p.id)}</span>
						</div>
					);
				})}
			</div>

			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: 'flex',
					flexDirection: 'column',
					borderLeft: '1px solid #ffffff18',
					position: 'relative',
				}}>
				<div style={{ flex: 1, minHeight: 0 }}>
					<Canvas
						camera={{ fov: 35, position: [0.6, 1.4, 1.6] }}
						style={{ background: '#101018' }}
						gl={{ antialias: true, alpha: true }}>
						<Stage
							piece={sel}
							ghost={ghost}
							snapRequest={snapRequest}
							onSnapshot={(png) =>
								setPending({ ref: sel.id, png })
							}
						/>
					</Canvas>
				</div>
				<div
					style={{
						padding: '12px 18px',
						borderTop: '1px solid #ffffff18',
						display: 'flex',
						alignItems: 'center',
						gap: 10,
					}}>
					<strong>{itemLabel(sel.id)}</strong>
					<span style={{ opacity: 0.5 }}>
						drag mesh to move · drag empty to orbit · wheel zoom
					</span>
					<label
						style={{
							marginLeft: 'auto',
							display: 'flex',
							gap: 6,
							alignItems: 'center',
							cursor: 'pointer',
						}}>
						<input
							type="checkbox"
							checked={ghost}
							onChange={(e) => setGhost(e.target.checked)}
						/>
						ghost body
					</label>
					<button
						id="icon-snapshot-btn"
						onClick={() => setSnapRequest((n) => n + 1)}
						style={studioBtn}>
						snapshot 64×64
					</button>
					{status && (
						<span style={{ opacity: 0.6, fontSize: 11 }}>
							{status}
						</span>
					)}
				</div>

				{pending && (
					<div
						id="icon-confirm"
						style={{
							position: 'absolute',
							inset: 0,
							background: '#05050add',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 5,
						}}>
						<div
							style={{
								background: '#101018',
								border: '1px solid #ffffff22',
								borderRadius: 8,
								padding: 20,
								textAlign: 'center',
							}}>
							<div style={{ marginBottom: 12 }}>
								Replace icon for{' '}
								<strong>{itemLabel(pending.ref)}</strong>?
							</div>
							<div
								style={{
									display: 'flex',
									gap: 28,
									justifyContent: 'center',
									marginBottom: 14,
								}}>
								{(
									[
										['current', iconUrl(pending.ref)],
										['new', pending.png],
									] as const
								).map(([label, src]) => (
									<div key={label}>
										<div
											style={{
												opacity: 0.6,
												marginBottom: 6,
											}}>
											{label}
										</div>
										<div
											style={{
												display: 'flex',
												gap: 8,
												alignItems: 'flex-end',
											}}>
											<img
												src={src}
												alt={label}
												width={64}
												height={64}
												style={{
													imageRendering: 'pixelated',
													background: '#1c1c26',
												}}
											/>
											<img
												src={src}
												alt=""
												width={128}
												height={128}
												style={{
													imageRendering: 'pixelated',
													background: '#1c1c26',
												}}
											/>
										</div>
									</div>
								))}
							</div>
							<div
								style={{
									display: 'flex',
									gap: 10,
									justifyContent: 'center',
								}}>
								<button
									id="icon-confirm-replace"
									onClick={replace}
									style={{
										...studioBtn,
										background: '#2f4a2f',
										borderColor: '#7ac77a88',
									}}>
									Replace
								</button>
								<button
									onClick={() => setPending(null)}
									style={studioBtn}>
									Cancel
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

const studioBtn: React.CSSProperties = {
	background: '#ffffff12',
	border: '1px solid #ffffff22',
	color: '#fff',
	padding: '5px 12px',
	borderRadius: 4,
	cursor: 'pointer',
};
