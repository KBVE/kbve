import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
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

const CIRCLE = new THREE.CircleGeometry(1, 20);
const DOT = new THREE.CircleGeometry(1, 8);

// Zoom thresholds as multiples of the fit zoom, so the tiers reveal at the same
// *relative* zoom regardless of how large the graph's coordinate box is.
const FILE_IN = 3.5;
const SYMBOL_IN = 14;

export type ColorMode = 'dir' | 'community';

export interface HoverInfo {
	kind: 'dir' | 'file' | 'symbol';
	label: string;
	sub: string;
	x: number;
	y: number;
}

interface Props {
	overview: Overview;
	loadDir: (slug: string) => Promise<DirChunk | null>;
	getChunk: (slug: string) => DirChunk | null;
	colorMode: ColorMode;
	onHover: (h: HoverInfo | null) => void;
	onPickDir: (dir: DirNodeLike | null) => void;
}

interface DirNodeLike {
	id: string;
	label: string;
	n: number;
	files: number;
}

export default function TieredGraphScene({
	overview,
	loadDir,
	getChunk,
	colorMode,
	onHover,
	onPickDir,
}: Props) {
	const { camera, size } = useThree();
	const controls = useRef<MapControlsImpl>(null);
	const fitZoom = useRef(1);
	const dirMesh = useRef<THREE.InstancedMesh>(null);
	const [activeSlug, setActiveSlug] = useState<string | null>(null);
	const [chunkVersion, setChunkVersion] = useState(0);

	// Fit camera to the directory bounds once. Camera and MapControls target
	// share the same centre so the view looks straight at the graph.
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

	// Directory instances (matrices + colors).
	useLayoutEffect(() => {
		const mesh = dirMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		overview.dirs.forEach((d, i) => {
			m.compose(
				new THREE.Vector3(d.x, d.y, 0),
				new THREE.Quaternion(),
				new THREE.Vector3(d.r, d.r, 1),
			);
			mesh.setMatrixAt(i, m);
			const [r, g, b] =
				colorMode === 'community'
					? communityColor(d.c)
					: dirColor(i, overview.dirs.length);
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [overview, colorMode]);

	const dirEdgeGeo = useMemo(() => {
		const pos = new Float32Array(overview.dirEdges.length * 6);
		overview.dirEdges.forEach(([a, b], k) => {
			const da = overview.dirs[a];
			const db = overview.dirs[b];
			if (!da || !db) return;
			pos.set([da.x, da.y, -2, db.x, db.y, -2], k * 6);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, [overview]);

	// LOD: pick the directory under the viewport centre when zoomed past the
	// file threshold, lazy-load its chunk, and fade the dir layer down.
	const dirMat = useRef<THREE.MeshBasicMaterial>(null);
	useFrame(() => {
		const zoom = (camera as THREE.OrthographicCamera).zoom;
		const fz = fitZoom.current;
		const rel = zoom / fz;
		if (dirMat.current)
			dirMat.current.opacity = THREE.MathUtils.clamp(
				1 - (rel - FILE_IN) / (SYMBOL_IN * 0.6 - FILE_IN),
				0.05,
				0.9,
			);
		if (rel >= FILE_IN) {
			// Nearest dir to the current camera target.
			const tx = controls.current?.target.x ?? camera.position.x;
			const ty = controls.current?.target.y ?? camera.position.y;
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
				loadDir(best).then((c) => {
					if (c) setChunkVersion((v) => v + 1);
				});
			}
		} else if (activeSlug !== null) {
			setActiveSlug(null);
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
				<lineBasicMaterial color="#3b4a63" transparent opacity={0.4} />
			</lineSegments>

			<instancedMesh
				ref={dirMesh}
				args={[CIRCLE, undefined, overview.dirs.length]}
				onPointerMove={(e: ThreeEvent<PointerEvent>) => {
					const i = e.instanceId;
					if (i == null) return;
					e.stopPropagation();
					const d = overview.dirs[i];
					onHover({
						kind: 'dir',
						label: d.label,
						sub: `${d.n.toLocaleString()} symbols · ${d.files} files`,
						x: e.nativeEvent.clientX,
						y: e.nativeEvent.clientY,
					});
				}}
				onPointerOut={() => onHover(null)}
				onClick={(e: ThreeEvent<MouseEvent>) => {
					const i = e.instanceId;
					if (i == null) return;
					e.stopPropagation();
					const d = overview.dirs[i];
					onPickDir({
						id: d.id,
						label: d.label,
						n: d.n,
						files: d.files,
					});
					loadDir(d.id);
					if (controls.current) {
						controls.current.target.set(d.x, d.y, 0);
						camera.position.set(d.x, d.y, 100);
						(camera as THREE.OrthographicCamera).zoom =
							fitZoom.current * 6;
						camera.updateProjectionMatrix();
						controls.current.update();
					}
				}}
			>
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
					onHover={onHover}
					// eslint-disable-next-line react-hooks/exhaustive-deps
					version={chunkVersion}
				/>
			)}
		</>
	);
}

interface DetailProps {
	chunk: DirChunk;
	fitZoom: number;
	colorMode: ColorMode;
	dirIndex: number;
	dirTotal: number;
	onHover: (h: HoverInfo | null) => void;
	version: number;
}

/**
 * Files + symbols for a single directory. Files fade in first; symbols reveal
 * on deeper zoom. Instanced meshes are sized to this chunk and remount when the
 * focused directory changes (via the parent's `key`).
 */
function DirDetail({
	chunk,
	fitZoom,
	colorMode,
	dirIndex,
	dirTotal,
	onHover,
}: DetailProps) {
	const { camera } = useThree();
	const fileMesh = useRef<THREE.InstancedMesh>(null);
	const symMesh = useRef<THREE.InstancedMesh>(null);
	const fileGroup = useRef<THREE.Group>(null);
	const symGroup = useRef<THREE.Group>(null);
	const fileMat = useRef<THREE.MeshBasicMaterial>(null);
	const symMat = useRef<THREE.MeshBasicMaterial>(null);

	useLayoutEffect(() => {
		const mesh = fileMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		const [r, g, b] = dirColor(dirIndex, dirTotal);
		chunk.files.forEach((f, i) => {
			const rad = 7 + Math.sqrt(f.n) * 2.6;
			m.compose(
				new THREE.Vector3(f.x, f.y, 1),
				new THREE.Quaternion(),
				new THREE.Vector3(rad, rad, 1),
			);
			mesh.setMatrixAt(i, m);
			col.setRGB(r, g, b);
			mesh.setColorAt(i, col);
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [chunk, dirIndex, dirTotal]);

	useLayoutEffect(() => {
		const mesh = symMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		chunk.symbols.forEach((s, i) => {
			m.compose(
				new THREE.Vector3(s.x, s.y, 2),
				new THREE.Quaternion(),
				new THREE.Vector3(4, 4, 1),
			);
			mesh.setMatrixAt(i, m);
			const [r, g, b] =
				colorMode === 'community'
					? communityColor(s.c)
					: dirColor(dirIndex, dirTotal);
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [chunk, colorMode, dirIndex, dirTotal]);

	const fileEdgeGeo = useMemo(() => {
		const pos = new Float32Array(chunk.fileEdges.length * 6);
		chunk.fileEdges.forEach(([a, b], k) => {
			const fa = chunk.files[a];
			const fb = chunk.files[b];
			if (!fa || !fb) return;
			pos.set([fa.x, fa.y, 0.5, fb.x, fb.y, 0.5], k * 6);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, [chunk]);

	const symEdgeGeo = useMemo(() => {
		const pos = new Float32Array(chunk.symbolEdges.length * 6);
		chunk.symbolEdges.forEach(([a, b], k) => {
			const sa = chunk.symbols[a];
			const sb = chunk.symbols[b];
			if (!sa || !sb) return;
			pos.set([sa.x, sa.y, 1.5, sb.x, sb.y, 1.5], k * 6);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, [chunk]);

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
		if (fileMat.current) fileMat.current.opacity = fileT * (1 - symT * 0.6);
		if (symGroup.current) symGroup.current.visible = symT > 0.02;
		if (symMat.current) symMat.current.opacity = symT;
	});

	return (
		<>
			<group ref={fileGroup}>
				<lineSegments geometry={fileEdgeGeo}>
					<lineBasicMaterial
						color="#4b5b74"
						transparent
						opacity={0.3}
					/>
				</lineSegments>
				<instancedMesh
					ref={fileMesh}
					args={[CIRCLE, undefined, chunk.files.length]}
					onPointerMove={(e: ThreeEvent<PointerEvent>) => {
						const i = e.instanceId;
						if (i == null) return;
						e.stopPropagation();
						const f = chunk.files[i];
						onHover({
							kind: 'file',
							label: f.label,
							sub: `${f.path} · ${f.n} symbols`,
							x: e.nativeEvent.clientX,
							y: e.nativeEvent.clientY,
						});
					}}
					onPointerOut={() => onHover(null)}
				>
					<meshBasicMaterial ref={fileMat} transparent opacity={0} />
				</instancedMesh>
			</group>

			<group ref={symGroup}>
				<lineSegments geometry={symEdgeGeo}>
					<lineBasicMaterial
						color="#334155"
						transparent
						opacity={0.25}
					/>
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
				>
					<meshBasicMaterial ref={symMat} transparent opacity={0} />
				</instancedMesh>
			</group>
		</>
	);
}
