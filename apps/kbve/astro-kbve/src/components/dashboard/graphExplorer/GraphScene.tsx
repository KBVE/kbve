import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
	communityColor,
	type LayeredGraph,
} from './useGraphLayout';

const CIRCLE = new THREE.CircleGeometry(1, 24);
const NODE_CIRCLE = new THREE.CircleGeometry(1, 12);

// LOD thresholds expressed as multiples of the fit zoom, so the member layer
// fades in at the same *relative* zoom regardless of graph size (the absolute
// fit zoom shrinks as the graph grows toward 10k nodes).
const NODE_FADE_IN_MULT = 2.2;
const COMMUNITY_FADE_OUT_MULT = 6;

interface Props {
	data: LayeredGraph;
}

/**
 * Two instanced layers (community super-nodes + member nodes) plus edge line
 * segments. The member layer fades in as the orthographic camera zooms past a
 * threshold — a coarse level-of-detail that keeps the community overview
 * readable while letting you drill into the graph.
 */
export default function GraphScene({ data }: Props) {
	const { camera, size } = useThree();
	const controls = useRef<MapControlsImpl>(null);
	const fitZoom = useRef(1);
	const communityMesh = useRef<THREE.InstancedMesh>(null);
	const nodeMesh = useRef<THREE.InstancedMesh>(null);
	const nodeGroup = useRef<THREE.Group>(null);

	// Fit the camera to the graph bounds on first mount. The ortho camera and
	// the MapControls target must share the same (cx, cy) so the view looks
	// straight down at the graph centre — otherwise the controls pull the
	// camera back toward the origin and the graph slides off-screen.
	useEffect(() => {
		const xs = data.communities.map((c) => c.x);
		const ys = data.communities.map((c) => c.y);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1);
		const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1);
		const zoom = Math.min(
			size.width / (spanX * 1.3),
			size.height / (spanY * 1.3),
		);
		camera.position.set(cx, cy, 100);
		(camera as THREE.OrthographicCamera).zoom = zoom;
		camera.updateProjectionMatrix();
		fitZoom.current = zoom;
		if (controls.current) {
			controls.current.target.set(cx, cy, 0);
			controls.current.update();
		}
	}, [data, camera, size.width, size.height]);

	// Community instances (matrices + colors).
	useLayoutEffect(() => {
		const mesh = communityMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		data.communities.forEach((c, i) => {
			m.compose(
				new THREE.Vector3(c.x, c.y, 0),
				new THREE.Quaternion(),
				new THREE.Vector3(c.r, c.r, 1),
			);
			mesh.setMatrixAt(i, m);
			const [r, g, b] = communityColor(c.id);
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [data]);

	// Member-node instances.
	useLayoutEffect(() => {
		const mesh = nodeMesh.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		const col = new THREE.Color();
		data.nodes.forEach((n, i) => {
			const radius = 3 + Math.min(n.d, 40) * 0.6;
			m.compose(
				new THREE.Vector3(n.x, n.y, 1),
				new THREE.Quaternion(),
				new THREE.Vector3(radius, radius, 1),
			);
			mesh.setMatrixAt(i, m);
			const [r, g, b] = communityColor(n.c);
			mesh.setColorAt(i, col.setRGB(r, g, b));
		});
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [data]);

	// Community edge geometry (always visible, faint).
	const communityEdgeGeo = useMemo(() => {
		const pos = new Float32Array(data.communityEdges.length * 6);
		data.communityEdges.forEach(([a, b], k) => {
			const ca = data.communities[a];
			const cb = data.communities[b];
			if (!ca || !cb) return;
			pos.set([ca.x, ca.y, -1, cb.x, cb.y, -1], k * 6);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, [data]);

	// Member edge geometry (LOD-gated: shown only when zoomed in).
	const nodeEdgeGeo = useMemo(() => {
		const pos = new Float32Array(data.edges.length * 6);
		data.edges.forEach(([a, b], k) => {
			const na = data.nodes[a];
			const nb = data.nodes[b];
			if (!na || !nb) return;
			pos.set([na.x, na.y, 0.5, nb.x, nb.y, 0.5], k * 6);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, [data]);

	// LOD: drive per-layer opacity from the camera zoom each frame.
	useFrame(() => {
		const zoom = (camera as THREE.OrthographicCamera).zoom;
		const fz = fitZoom.current;
		const nodeIn = fz * NODE_FADE_IN_MULT;
		const commOut = fz * COMMUNITY_FADE_OUT_MULT;
		const nodeT = THREE.MathUtils.clamp(
			(zoom - nodeIn) / (commOut - nodeIn),
			0,
			1,
		);
		if (nodeGroup.current) nodeGroup.current.visible = nodeT > 0.02;
		const nm = nodeMesh.current;
		if (nm) (nm.material as THREE.MeshBasicMaterial).opacity = nodeT;
		const cm = communityMesh.current;
		if (cm)
			(cm.material as THREE.MeshBasicMaterial).opacity =
				0.35 + (1 - nodeT) * 0.5;
	});

	return (
		<>
			<MapControls
				ref={controls}
				enableRotate={false}
				screenSpacePanning
				minZoom={0.02}
				maxZoom={12}
			/>
			<lineSegments geometry={communityEdgeGeo}>
				<lineBasicMaterial
					color="#64748b"
					transparent
					opacity={0.25}
				/>
			</lineSegments>

			<instancedMesh
				ref={communityMesh}
				args={[CIRCLE, undefined, data.communities.length]}
			>
				<meshBasicMaterial transparent opacity={0.85} />
			</instancedMesh>

			<group ref={nodeGroup}>
				<lineSegments geometry={nodeEdgeGeo}>
					<lineBasicMaterial
						color="#475569"
						transparent
						opacity={0.15}
					/>
				</lineSegments>
				<instancedMesh
					ref={nodeMesh}
					args={[NODE_CIRCLE, undefined, data.nodes.length]}
				>
					<meshBasicMaterial transparent opacity={0} />
				</instancedMesh>
			</group>
		</>
	);
}
