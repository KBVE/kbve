import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface McSkinViewerProps {
	uuid: string;
	width?: number;
	height?: number;
}

const SKIN_W = 64;
const SKIN_H = 64;
const S = 1 / 16; // Scale: 32px total height → 2 units

// Pixel regions for each body part face: [x1, y1, x2, y2]
// Face order: [+X(left), -X(right), +Y(top), -Y(bottom), +Z(back), -Z(front)]
type FaceUVs = [number, number, number, number][];

const HEAD_UVS: FaceUVs = [
	[16, 8, 24, 16],
	[0, 8, 8, 16],
	[8, 0, 16, 8],
	[16, 0, 24, 8],
	[24, 8, 32, 16],
	[8, 8, 16, 16],
];

const BODY_UVS: FaceUVs = [
	[28, 20, 32, 32],
	[16, 20, 20, 32],
	[20, 16, 28, 20],
	[28, 16, 36, 20],
	[32, 20, 40, 32],
	[20, 20, 28, 32],
];

const R_ARM_UVS: FaceUVs = [
	[48, 20, 52, 32],
	[40, 20, 44, 32],
	[44, 16, 48, 20],
	[48, 16, 52, 20],
	[52, 20, 56, 32],
	[44, 20, 48, 32],
];

const L_ARM_UVS: FaceUVs = [
	[40, 52, 44, 64],
	[32, 52, 36, 64],
	[36, 48, 40, 52],
	[40, 48, 44, 52],
	[44, 52, 48, 64],
	[36, 52, 40, 64],
];

const R_LEG_UVS: FaceUVs = [
	[8, 20, 12, 32],
	[0, 20, 4, 32],
	[4, 16, 8, 20],
	[8, 16, 12, 20],
	[12, 20, 16, 32],
	[4, 20, 8, 32],
];

const L_LEG_UVS: FaceUVs = [
	[24, 52, 28, 64],
	[16, 52, 20, 64],
	[20, 48, 24, 52],
	[24, 48, 28, 52],
	[28, 52, 32, 64],
	[20, 52, 24, 64],
];

// Faces 0 (+X/left) and 5 (-Z/front) need horizontal UV flip
// due to Three.js BoxGeometry vertex winding vs MC skin convention
const FLIP_U = [true, false, false, false, false, true];

function applyUVs(geometry: THREE.BoxGeometry, faceUVs: FaceUVs): void {
	const uv = geometry.getAttribute('uv');
	const uvArray = uv.array as Float32Array;

	for (let face = 0; face < 6; face++) {
		const [px1, py1, px2, py2] = faceUVs[face];
		let u1 = px1 / SKIN_W;
		let u2 = px2 / SKIN_W;
		const v1 = 1 - py2 / SKIN_H;
		const v2 = 1 - py1 / SKIN_H;

		if (FLIP_U[face]) {
			const tmp = u1;
			u1 = u2;
			u2 = tmp;
		}

		const offset = face * 8;
		uvArray[offset + 0] = u1;
		uvArray[offset + 1] = v2;
		uvArray[offset + 2] = u2;
		uvArray[offset + 3] = v2;
		uvArray[offset + 4] = u1;
		uvArray[offset + 5] = v1;
		uvArray[offset + 6] = u2;
		uvArray[offset + 7] = v1;
	}

	uv.needsUpdate = true;
}

function SkinModel({ texture }: { texture: THREE.Texture }) {
	const groupRef = useRef<THREE.Group>(null);

	const geometries = useMemo(() => {
		const head = new THREE.BoxGeometry(8 * S, 8 * S, 8 * S);
		applyUVs(head, HEAD_UVS);

		const body = new THREE.BoxGeometry(8 * S, 12 * S, 4 * S);
		applyUVs(body, BODY_UVS);

		const rArm = new THREE.BoxGeometry(4 * S, 12 * S, 4 * S);
		applyUVs(rArm, R_ARM_UVS);

		const lArm = new THREE.BoxGeometry(4 * S, 12 * S, 4 * S);
		applyUVs(lArm, L_ARM_UVS);

		const rLeg = new THREE.BoxGeometry(4 * S, 12 * S, 4 * S);
		applyUVs(rLeg, R_LEG_UVS);

		const lLeg = new THREE.BoxGeometry(4 * S, 12 * S, 4 * S);
		applyUVs(lLeg, L_LEG_UVS);

		return { head, body, rArm, lArm, rLeg, lLeg };
	}, []);

	const material = useMemo(() => {
		return new THREE.MeshStandardMaterial({
			map: texture,
			side: THREE.FrontSide,
			alphaTest: 0.1,
		});
	}, [texture]);

	useFrame((_, delta) => {
		if (groupRef.current) {
			groupRef.current.rotation.y += delta * 0.4;
		}
	});

	return (
		<group ref={groupRef} position={[0, -1, 0]}>
			<mesh
				geometry={geometries.head}
				material={material}
				position={[0, 28 * S, 0]}
			/>
			<mesh
				geometry={geometries.body}
				material={material}
				position={[0, 18 * S, 0]}
			/>
			<mesh
				geometry={geometries.rArm}
				material={material}
				position={[-6 * S, 18 * S, 0]}
			/>
			<mesh
				geometry={geometries.lArm}
				material={material}
				position={[6 * S, 18 * S, 0]}
			/>
			<mesh
				geometry={geometries.rLeg}
				material={material}
				position={[-2 * S, 6 * S, 0]}
			/>
			<mesh
				geometry={geometries.lLeg}
				material={material}
				position={[2 * S, 6 * S, 0]}
			/>
		</group>
	);
}

function FallbackCube() {
	const ref = useRef<THREE.Mesh>(null);
	useFrame((_, delta) => {
		if (ref.current) ref.current.rotation.y += delta * 0.5;
	});
	return (
		<mesh ref={ref}>
			<boxGeometry args={[0.5, 0.5, 0.5]} />
			<meshStandardMaterial color="#4a5568" wireframe />
		</mesh>
	);
}

function SkinScene({ uuid }: { uuid: string }) {
	const [texture, setTexture] = useState<THREE.Texture | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setTexture(null);
		setFailed(false);

		const cleanUuid = uuid.replace(/-/g, '');
		const url = `https://crafatar.com/skins/${cleanUuid}`;
		const loader = new THREE.TextureLoader();
		loader.setCrossOrigin('anonymous');
		loader.load(
			url,
			(tex) => {
				tex.magFilter = THREE.NearestFilter;
				tex.minFilter = THREE.NearestFilter;
				tex.generateMipmaps = false;
				setTexture(tex);
			},
			undefined,
			() => setFailed(true),
		);
	}, [uuid]);

	if (failed) return <FallbackCube />;
	if (!texture) return <FallbackCube />;
	return <SkinModel texture={texture} />;
}

export default function McSkinViewer({
	uuid,
	width = 300,
	height = 400,
}: McSkinViewerProps) {
	return (
		<div style={{ width, height }}>
			<Canvas
				camera={{ position: [0, 0.2, 2.8], fov: 45 }}
				style={{ background: 'transparent' }}>
				<ambientLight intensity={1.8} />
				<directionalLight position={[5, 8, 5]} intensity={1.2} />
				<directionalLight position={[-3, 4, -3]} intensity={0.5} />
				<SkinScene uuid={uuid} />
				<OrbitControls
					enablePan={false}
					enableZoom={false}
					minPolarAngle={Math.PI / 6}
					maxPolarAngle={(Math.PI * 5) / 6}
				/>
			</Canvas>
		</div>
	);
}
