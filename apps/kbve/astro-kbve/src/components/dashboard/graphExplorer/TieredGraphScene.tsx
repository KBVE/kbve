import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
	communityColor,
	dirColor,
	type DirChunk,
	type Overview,
} from './useMonorepoGraph';
import { buildEdgeGeo, buildAdjacency, githubUrl } from './graphGeo';
import GraphLabels, { type LabelItem } from './GraphLabels';

// Reduced segments for better performance - visually indistinguishable
const CIRCLE = new THREE.CircleGeometry(1, 16);
const DOT = new THREE.CircleGeometry(1, 6);

// Enhanced node sizing for better mobile visibility
const MIN_DIR_RADIUS = 8;  // Minimum directory node size
const MIN_FILE_RADIUS = 10; // Minimum file node size (slightly larger for touch targets)

const FILE_IN = 3.5;
const SYMBOL_IN = 14;
const FLY_SECONDS = 0.6;

export type ColorMode = 'dir' | 'community';

export interface HoverInfo {
	kind: 'dir' | 'file' | 'symbol';
	label: string;
	sub: string;
	x: number;
	y: number;
}

interface DirNodeLike {
	id: string;
	label: string;
	n: number;
	files: number;
	ref?: string;
	nx?: { projects: { name: string; type?: string }[] };
}

interface Props {
	overview: Overview;
	loadDir: (slug: string) => Promise<DirChunk | null>;
	getChunk: (slug: string) => DirChunk | null;
	colorMode: ColorMode;
	labelHost: HTMLDivElement | null;
	focusRequest: { id: string; seq: number } | null;
	zoomTrigger: { delta: number; seq: number } | null;
	resetTrigger: number;
	onHover: (h: HoverInfo | null) => void;
	onPickDir: (dir: DirNodeLike | null) => void;
	onZoomChange?: (zoom: number) => void;
}

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

export default function TieredGraphScene({
	overview,
	loadDir,
	getChunk,
	colorMode,
	labelHost,
	focusRequest,
	zoomTrigger,
	resetTrigger,
	onHover,
	onPickDir,
	onZoomChange,
}: Props) {
	const { camera, size } = useThree();
	const controls = useRef<MapControlsImpl>(null);
	const fitZoom = useRef(1);
	const dirMesh = useRef<THREE.InstancedMesh>(null);
	const dirOutline = useRef<THREE.InstancedMesh>(null);
	const dirMat = useRef<THREE.MeshBasicMaterial>(null);
	const [activeSlug, setActiveSlug] = useState<string | null>(null);
	const [, setChunkVersion] = useState(0);
	const [hoverDir, setHoverDir] = useState<number | null>(null);
	const dirLabelOp = useRef(0.9);
	const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

	const adjacency = useMemo(
		() => buildAdjacency(overview.dirEdges),
		[overview],
	);

	const fly = useRef<null | {
		sx: number;
		sy: number;
		ex: number;
		ey: number;
		sz: number;
		ez: number;
		t: number;
	}>(null);

	const startFly = (ex: number, ey: number, ez: number) => {
		const cam = camera as THREE.OrthographicCamera;
		fly.current = {
			sx: cam.position.x,
			sy: cam.position.y,
			ex,
			ey,
			sz: cam.zoom,
			ez,
			t: 0,
		};
	};

	// Fit camera to directory bounds; share centre with the controls target.
	useEffect(() => {
		const xs = overview.dirs.map((d) => d.x);
		const ys = overview.dirs.map((d) => d.y);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1);
		const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1);
		const zoom = Math.min(
			size.width / (spanX * 1.25),
			size.height / (spanY * 1.25),
		);
		camera.position.set(cx, cy, 100);
		(camera as THREE.OrthographicCamera).zoom = zoom;
		camera.updateProjectionMatrix();
		fitZoom.current = zoom;
		if (controls.current) {
			controls.current.target.set(cx, cy, 0);
			controls.current.update();
		}
	}, [overview, camera, size.width, size.height]);

	// Track user interaction state to prevent automatic behaviors during manual pan/zoom
	const isUserInteracting = useRef(false);

	// Cancel an in-flight fly when the user grabs the controls.
	useEffect(() => {
		const c = controls.current;
		if (!c) return;
		const onStart = () => {
			fly.current = null;
			isUserInteracting.current = true;
		};
		const onEnd = () => {
			isUserInteracting.current = false;
		};
		c.addEventListener('start', onStart);
		c.addEventListener('end', onEnd);
		return () => {
			c.removeEventListener('start', onStart);
			c.removeEventListener('end', onEnd);
		};
	}, []);

	// External focus request (search box): fly to the directory + activate it.
	useEffect(() => {
		if (!focusRequest) return;
		const idx = overview.dirs.findIndex((d) => d.id === focusRequest.id);
		if (idx < 0) return;
		const d = overview.dirs[idx];
		startFly(d.x, d.y, fitZoom.current * 6);
		setActiveSlug(d.id);
		loadDir(d.id).then((c) => c && setChunkVersion((v) => v + 1));
		onPickDir({
			id: d.id,
			label: d.label,
			n: d.n,
			files: d.files,
			ref: d.ref,
			nx: d.nx,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focusRequest]);

	// Handle zoom button triggers
	useEffect(() => {
		if (!zoomTrigger || !controls.current) return;
		const cam = camera as THREE.OrthographicCamera;
		const newZoom = cam.zoom * zoomTrigger.delta;
		const clampedZoom = Math.max(
			fitZoom.current * 0.5,
			Math.min(fitZoom.current * 60, newZoom),
		);
		cam.zoom = clampedZoom;
		cam.updateProjectionMatrix();
		controls.current.update();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [zoomTrigger]);

	// Handle reset view trigger
	useEffect(() => {
		if (resetTrigger === 0) return;
		const xs = overview.dirs.map((d) => d.x);
		const ys = overview.dirs.map((d) => d.y);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		startFly(cx, cy, fitZoom.current);
		setActiveSlug(null);
		onPickDir(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resetTrigger]);

	// Directory outline instances (dark, slightly larger, behind).
	useLayoutEffect(() => {
		const mesh = dirOutline.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color('#05070d');
		overview.dirs.forEach((d, i) => {
			m.compose(
				new THREE.Vector3(d.x, d.y, -0.5),
				new THREE.Quaternion(),
				new THREE.Vector3(d.r * 1.08, d.r * 1.08, 1),
			);
			mesh.setMatrixAt(i, m);
			mesh.setColorAt(i, col);
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [overview]);

	// Directory fill instances — recolored on hover for focus-mode.
	useLayoutEffect(() => {
		const mesh = dirMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		const neigh = hoverDir != null ? adjacency.get(hoverDir) : null;
		overview.dirs.forEach((d, i) => {
			// Ensure minimum node size for better mobile touch targets
			const nodeRadius = Math.max(d.r, MIN_DIR_RADIUS);
			m.compose(
				new THREE.Vector3(d.x, d.y, 0),
				new THREE.Quaternion(),
				new THREE.Vector3(nodeRadius, nodeRadius, 1),
			);
			mesh.setMatrixAt(i, m);
			let [r, g, b] =
				colorMode === 'community'
					? communityColor(d.c)
					: dirColor(i, overview.dirs.length);
			if (hoverDir != null) {
				const lit = i === hoverDir || neigh?.has(i);
				// Enhanced contrast for focus mode - more dramatic difference
				const f = lit ? 1.25 : 0.18;
				r *= f;
				g *= f;
				b *= f;
			}
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [overview, colorMode, hoverDir, adjacency]);

	const dirNodes = overview.dirs;
	const dirEdgeGeo = useMemo(() => {
		const geo = buildEdgeGeo(dirNodes, overview.dirEdges, -2, { minBright: 0.3 });
		return geo;
	}, [overview, dirNodes]);

	// Dispose edge geometries on cleanup
	useEffect(() => {
		return () => {
			dirEdgeGeo.dispose();
		};
	}, [dirEdgeGeo]);
	const dirHiEdgeGeo = useMemo(() => {
		if (hoverDir == null) return null;
		return buildEdgeGeo(dirNodes, overview.dirEdges, -1.5, {
			keep: (e) => e[0] === hoverDir || e[1] === hoverDir,
			minBright: 0.7,
		});
	}, [overview, dirNodes, hoverDir]);

	// Dispose highlight edge geometry when it changes
	useEffect(() => {
		return () => {
			dirHiEdgeGeo?.dispose();
		};
	}, [dirHiEdgeGeo]);

	const dirLabels = useMemo<LabelItem[]>(
		() =>
			overview.dirs.map((d) => ({
				id: d.id,
				x: d.x,
				y: d.y,
				text: d.label,
				tier: 'dir',
				priority: Math.log(d.n + 1),
			})),
		[overview],
	);

	useFrame(() => {
		const cam = camera as THREE.OrthographicCamera;
		// Animate a pending fly-to.
		if (fly.current && controls.current) {
			const f = fly.current;
			f.t = Math.min(1, f.t + 1 / 60 / FLY_SECONDS);
			const e = easeOutCubic(f.t);
			const x = f.sx + (f.ex - f.sx) * e;
			const y = f.sy + (f.ey - f.sy) * e;
			cam.position.set(x, y, 100);
			cam.zoom = f.sz + (f.ez - f.sz) * e;
			cam.updateProjectionMatrix();
			controls.current.target.set(x, y, 0);
			controls.current.update();
			if (f.t >= 1) fly.current = null;
		}

		const rel = cam.zoom / fitZoom.current;
		const dop = THREE.MathUtils.clamp(
			1 - (rel - FILE_IN) / (SYMBOL_IN * 0.6 - FILE_IN),
			0.05,
			0.9,
		);
		if (dirMat.current) dirMat.current.opacity = dop;
		dirLabelOp.current = dop;

		// Report zoom level to parent
		if (onZoomChange) {
			onZoomChange(rel);
		}

		// Only auto-load directories when user is NOT actively panning/zooming
		if (!isUserInteracting.current) {
			if (rel >= FILE_IN) {
				const tx = controls.current?.target.x ?? cam.position.x;
				const ty = controls.current?.target.y ?? cam.position.y;
				let best: string | null = null;
				let bestD = Infinity;
				for (const d of overview.dirs) {
					const dd = (d.x - tx) ** 2 + (d.y - ty) ** 2;
					if (dd < bestD) {
						bestD = dd;
						best = d.id;
					}
				}
				if (best && best !== activeSlug) {
					setActiveSlug(best);
					loadDir(best).then((c) => c && setChunkVersion((v) => v + 1));
				}
			} else if (activeSlug !== null) {
				setActiveSlug(null);
			}
		}
	});

	const activeChunk = activeSlug ? getChunk(activeSlug) : null;

	return (
		<>
			<MapControls
				ref={controls}
				enableRotate={false}
				screenSpacePanning
				minZoom={fitZoom.current * 0.5}
				maxZoom={fitZoom.current * 60}
			/>

			<lineSegments geometry={dirEdgeGeo}>
				<lineBasicMaterial vertexColors transparent opacity={0.65} />
			</lineSegments>
			{dirHiEdgeGeo && (
				<lineSegments geometry={dirHiEdgeGeo}>
					<lineBasicMaterial
						vertexColors
						transparent
						opacity={1.0}
					/>
				</lineSegments>
			)}

			<instancedMesh
				ref={dirOutline}
				args={[CIRCLE, undefined, overview.dirs.length]}>
				<meshBasicMaterial transparent opacity={0.9} />
			</instancedMesh>

			<instancedMesh
				ref={dirMesh}
				args={[CIRCLE, undefined, overview.dirs.length]}
				onPointerMove={(e: ThreeEvent<PointerEvent>) => {
					const i = e.instanceId;
					if (i == null) return;
					e.stopPropagation();
					if (i !== hoverDir) setHoverDir(i);
					const d = overview.dirs[i];

					// Only show tooltip on non-touch devices
					if (e.pointerType !== 'touch') {
						onHover({
							kind: 'dir',
							label: d.label,
							sub: `${d.n.toLocaleString()} symbols · ${d.files} files`,
							x: e.nativeEvent.clientX,
							y: e.nativeEvent.clientY,
						});
					}
				}}
				onPointerOut={() => {
					setHoverDir(null);
					onHover(null);
				}}
				onClick={(e: ThreeEvent<MouseEvent>) => {
					const i = e.instanceId;
					if (i == null) return;
					e.stopPropagation();
					const d = overview.dirs[i];

					// Handle double-tap to zoom on mobile
					const now = Date.now();
					const tap = lastTap.current;
					if (tap && now - tap.time < 300 &&
						Math.abs(e.nativeEvent.clientX - tap.x) < 30 &&
						Math.abs(e.nativeEvent.clientY - tap.y) < 30) {
						// Double tap - zoom in more aggressively
						startFly(d.x, d.y, fitZoom.current * 12);
						lastTap.current = null;
					} else {
						// Single tap - pick and focus
						onPickDir({
							id: d.id,
							label: d.label,
							n: d.n,
							files: d.files,
							ref: d.ref,
							nx: d.nx,
						});
						loadDir(d.id);
						startFly(d.x, d.y, fitZoom.current * 6);
						lastTap.current = { time: now, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
					}
				}}>
				<meshBasicMaterial ref={dirMat} transparent opacity={0.9} />
			</instancedMesh>

			{activeChunk && (
				<DirDetail
					key={activeSlug!}
					chunk={activeChunk}
					fitZoom={fitZoom.current}
					colorMode={colorMode}
					dirIndex={overview.dirs.findIndex(
						(d) => d.id === activeSlug,
					)}
					dirTotal={overview.dirs.length}
					labelHost={labelHost}
					onHover={onHover}
				/>
			)}

			<GraphLabels
				host={labelHost}
				items={dirLabels}
				maxVisible={40}
				opacityRef={dirLabelOp}
			/>
		</>
	);
}

interface DetailProps {
	chunk: DirChunk;
	fitZoom: number;
	colorMode: ColorMode;
	dirIndex: number;
	dirTotal: number;
	labelHost: HTMLDivElement | null;
	onHover: (h: HoverInfo | null) => void;
}

function DirDetail({
	chunk,
	fitZoom,
	colorMode,
	dirIndex,
	dirTotal,
	labelHost,
	onHover,
}: DetailProps) {
	const { camera } = useThree();
	const fileMesh = useRef<THREE.InstancedMesh>(null);
	const symMesh = useRef<THREE.InstancedMesh>(null);
	const fileGroup = useRef<THREE.Group>(null);
	const symGroup = useRef<THREE.Group>(null);
	const fileMat = useRef<THREE.MeshBasicMaterial>(null);
	const symMat = useRef<THREE.MeshBasicMaterial>(null);
	const fileLabelOp = useRef(0);
	const [hoverFile, setHoverFile] = useState<number | null>(null);
	const lastFileTap = useRef<{ time: number; index: number } | null>(null);

	const fileAdj = useMemo(() => buildAdjacency(chunk.fileEdges), [chunk]);

	useLayoutEffect(() => {
		const mesh = fileMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		const [br, bg, bb] = dirColor(dirIndex, dirTotal);
		const neigh = hoverFile != null ? fileAdj.get(hoverFile) : null;
		chunk.files.forEach((f, i) => {
			// Improved file node sizing with better minimum for mobile
			const rad = Math.max(MIN_FILE_RADIUS, 7 + Math.sqrt(f.n) * 2.6);
			m.compose(
				new THREE.Vector3(f.x, f.y, 1),
				new THREE.Quaternion(),
				new THREE.Vector3(rad, rad, 1),
			);
			mesh.setMatrixAt(i, m);
			let r = br,
				g = bg,
				b = bb;
			if (hoverFile != null) {
				const lit = i === hoverFile || neigh?.has(i);
				// Enhanced contrast for better visibility
				const fac = lit ? 1.35 : 0.2;
				r *= fac;
				g *= fac;
				b *= fac;
			}
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [chunk, dirIndex, dirTotal, hoverFile, fileAdj]);

	useLayoutEffect(() => {
		const mesh = symMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		chunk.symbols.forEach((s, i) => {
			// Slightly larger symbols for better mobile visibility
			const symbolSize = 5;
			m.compose(
				new THREE.Vector3(s.x, s.y, 2),
				new THREE.Quaternion(),
				new THREE.Vector3(symbolSize, symbolSize, 1),
			);
			mesh.setMatrixAt(i, m);
			const [r, g, b] =
				colorMode === 'community'
					? communityColor(s.c)
					: dirColor(dirIndex, dirTotal);
			// Slightly brighter symbols for better distinction
			mesh.setColorAt(i, col.setRGB(r * 1.1, g * 1.1, b * 1.1));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [chunk, colorMode, dirIndex, dirTotal]);

	const fileEdgeGeo = useMemo(
		() =>
			buildEdgeGeo(chunk.files, chunk.fileEdges, 0.5, {
				minBright: 0.35,
			}),
		[chunk],
	);
	const fileHiEdgeGeo = useMemo(() => {
		if (hoverFile == null) return null;
		return buildEdgeGeo(chunk.files, chunk.fileEdges, 0.7, {
			keep: (e) => e[0] === hoverFile || e[1] === hoverFile,
			minBright: 0.8,
		});
	}, [chunk, hoverFile]);
	const symEdgeGeo = useMemo(
		() =>
			buildEdgeGeo(chunk.symbols, chunk.symbolEdges, 1.5, {
				minBright: 0.25,
			}),
		[chunk],
	);

	const fileLabels = useMemo<LabelItem[]>(
		() =>
			chunk.files.map((f) => ({
				id: `${chunk.dir}/${f.i}`,
				x: f.x,
				y: f.y,
				text: f.label,
				tier: 'file',
				priority: Math.log(f.n + 1),
			})),
		[chunk],
	);

	useFrame(() => {
		const rel = (camera as THREE.OrthographicCamera).zoom / fitZoom;
		const fileT = THREE.MathUtils.clamp(
			(rel - FILE_IN) / (SYMBOL_IN - FILE_IN),
			0,
			1,
		);
		const symT = THREE.MathUtils.clamp(
			(rel - SYMBOL_IN) / (SYMBOL_IN * 1.5 - SYMBOL_IN),
			0,
			1,
		);
		if (fileGroup.current) fileGroup.current.visible = fileT > 0.02;
		if (fileMat.current)
			fileMat.current.opacity = fileT * (1 - symT * 0.55);
		if (symGroup.current) symGroup.current.visible = symT > 0.02;
		if (symMat.current) symMat.current.opacity = symT;
		fileLabelOp.current = fileT * (1 - symT * 0.7);
	});

	return (
		<>
			<group ref={fileGroup}>
				<lineSegments geometry={fileEdgeGeo}>
					<lineBasicMaterial vertexColors transparent opacity={0.55} />
				</lineSegments>
				{fileHiEdgeGeo && (
					<lineSegments geometry={fileHiEdgeGeo}>
						<lineBasicMaterial
							vertexColors
							transparent
							opacity={1.0}
						/>
					</lineSegments>
				)}
				<instancedMesh
					ref={fileMesh}
					args={[CIRCLE, undefined, chunk.files.length]}
					onPointerMove={(e: ThreeEvent<PointerEvent>) => {
						const i = e.instanceId;
						if (i == null) return;
						e.stopPropagation();
						if (i !== hoverFile) setHoverFile(i);
						const f = chunk.files[i];

						// Only show tooltip on non-touch devices
						if (e.pointerType !== 'touch') {
							onHover({
								kind: 'file',
								label: f.label,
								sub: `${f.path} · ${f.n} symbols`,
								x: e.nativeEvent.clientX,
								y: e.nativeEvent.clientY,
							});
						}
					}}
					onPointerOut={() => {
						setHoverFile(null);
						onHover(null);
					}}
					onClick={(e: ThreeEvent<MouseEvent>) => {
						const i = e.instanceId;
						if (i == null) return;
						e.stopPropagation();

						// Handle double-tap for better mobile UX
						const now = Date.now();
						const lastTap = lastFileTap.current;
						if (lastTap && now - lastTap.time < 300 && lastTap.index === i) {
							// Double tap - open file
							window.open(
								githubUrl(chunk.files[i].path),
								'_blank',
								'noopener',
							);
							lastFileTap.current = null;
						} else {
							// Single tap - show preview tooltip on mobile
							const f = chunk.files[i];
							onHover({
								kind: 'file',
								label: f.label,
								sub: `${f.path} · ${f.n} symbols · Double-tap to open`,
								x: e.nativeEvent.clientX,
								y: e.nativeEvent.clientY,
							});
							lastFileTap.current = { time: now, index: i };
							// Auto-hide tooltip after 2 seconds
							setTimeout(() => {
								onHover(null);
							}, 2000);
						}
					}}>
					<meshBasicMaterial ref={fileMat} transparent opacity={0} />
				</instancedMesh>
			</group>

			<group ref={symGroup}>
				<lineSegments geometry={symEdgeGeo}>
					<lineBasicMaterial vertexColors transparent opacity={0.45} />
				</lineSegments>
				<instancedMesh
					ref={symMesh}
					args={[DOT, undefined, chunk.symbols.length]}
					onPointerMove={(e: ThreeEvent<PointerEvent>) => {
						const i = e.instanceId;
						if (i == null) return;
						e.stopPropagation();
						const s = chunk.symbols[i];
						const f = chunk.files[s.f];
						onHover({
							kind: 'symbol',
							label: s.label,
							sub: `${f?.path ?? ''}${s.loc ? ' · ' + s.loc : ''}`,
							x: e.nativeEvent.clientX,
							y: e.nativeEvent.clientY,
						});
					}}
					onPointerOut={() => onHover(null)}
					onClick={(e: ThreeEvent<MouseEvent>) => {
						const i = e.instanceId;
						if (i == null) return;
						e.stopPropagation();
						const s = chunk.symbols[i];
						const f = chunk.files[s.f];
						if (f)
							window.open(
								githubUrl(f.path, s.loc),
								'_blank',
								'noopener',
							);
					}}>
					<meshBasicMaterial ref={symMat} transparent opacity={0} />
				</instancedMesh>
			</group>

			<GraphLabels
				host={labelHost}
				items={fileLabels}
				maxVisible={28}
				opacityRef={fileLabelOp}
			/>
		</>
	);
}
