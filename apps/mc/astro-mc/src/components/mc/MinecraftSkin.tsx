import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

/**
 * Converts a pixel rect on the 64x64 skin into UV bounds [u0, v0, u1, v1].
 *
 * With flipY = false (our setup):
 *   - Image row 0 (top of PNG) maps to V = 0
 *   - Image row 63 (bottom of PNG) maps to V = 1
 * So v = y / texH directly, no inversion needed.
 */
function uvRect(
	x: number,
	y: number,
	w: number,
	h: number,
	texW = 64,
	texH = 64,
): [number, number, number, number] {
	return [
		x / texW, // u0 — left edge
		y / texH, // v0 — top edge of region
		(x + w) / texW, // u1 — right edge
		(y + h) / texH, // v1 — bottom edge of region
	];
}

/**
 * Applies per-face UVs to a BoxGeometry.
 *
 * BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
 * Each face has 4 vertices in order: top-left, top-right, bottom-left, bottom-right
 * (confirmed from Three.js BoxGeometry source — buildPlane UV layout).
 */
function applyBoxUVs(
	geom: THREE.BoxGeometry,
	faceUVs: [number, number, number, number][],
): void {
	const uvAttr = geom.attributes.uv as THREE.BufferAttribute;
	for (let face = 0; face < 6; face++) {
		const [u0, v0, u1, v1] = faceUVs[face];
		const base = face * 4;
		uvAttr.setXY(base + 0, u0, v0); // top-left
		uvAttr.setXY(base + 1, u1, v0); // top-right
		uvAttr.setXY(base + 2, u0, v1); // bottom-left
		uvAttr.setXY(base + 3, u1, v1); // bottom-right
	}
	uvAttr.needsUpdate = true;
}

/**
 * Skin layout UV definitions for each body part.
 * Reference: https://minecraft.wiki/w/Skin#Layout
 *
 * BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
 * Mapped to: right, left, top, bottom, front, back
 */

// --- Inner layers ---

function headUVs(): [number, number, number, number][] {
	return [
		uvRect(16, 8, 8, 8), // +X right
		uvRect(0, 8, 8, 8), // -X left
		uvRect(8, 0, 8, 8), // +Y top
		uvRect(16, 0, 8, 8), // -Y bottom
		uvRect(8, 8, 8, 8), // +Z front
		uvRect(24, 8, 8, 8), // -Z back
	];
}

function bodyUVs(): [number, number, number, number][] {
	return [
		uvRect(28, 20, 4, 12), // +X right
		uvRect(16, 20, 4, 12), // -X left
		uvRect(20, 16, 8, 4), // +Y top
		uvRect(28, 16, 8, 4), // -Y bottom
		uvRect(20, 20, 8, 12), // +Z front
		uvRect(32, 20, 8, 12), // -Z back
	];
}

function rightArmUVs(): [number, number, number, number][] {
	return [
		uvRect(48, 20, 4, 12), // +X right
		uvRect(40, 20, 4, 12), // -X left
		uvRect(44, 16, 4, 4), // +Y top
		uvRect(48, 16, 4, 4), // -Y bottom
		uvRect(44, 20, 4, 12), // +Z front
		uvRect(52, 20, 4, 12), // -Z back
	];
}

function leftArmUVs(): [number, number, number, number][] {
	return [
		uvRect(40, 52, 4, 12), // +X right
		uvRect(32, 52, 4, 12), // -X left
		uvRect(36, 48, 4, 4), // +Y top
		uvRect(40, 48, 4, 4), // -Y bottom
		uvRect(36, 52, 4, 12), // +Z front
		uvRect(44, 52, 4, 12), // -Z back
	];
}

function rightLegUVs(): [number, number, number, number][] {
	return [
		uvRect(8, 20, 4, 12), // +X right
		uvRect(0, 20, 4, 12), // -X left
		uvRect(4, 16, 4, 4), // +Y top
		uvRect(8, 16, 4, 4), // -Y bottom
		uvRect(4, 20, 4, 12), // +Z front
		uvRect(12, 20, 4, 12), // -Z back
	];
}

function leftLegUVs(): [number, number, number, number][] {
	return [
		uvRect(24, 52, 4, 12), // +X right
		uvRect(16, 52, 4, 12), // -X left
		uvRect(20, 48, 4, 4), // +Y top
		uvRect(24, 48, 4, 4), // -Y bottom
		uvRect(20, 52, 4, 12), // +Z front
		uvRect(28, 52, 4, 12), // -Z back
	];
}

// --- Outer layers (hat, jacket, sleeves, pants) ---

function headOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(48, 8, 8, 8),
		uvRect(32, 8, 8, 8),
		uvRect(40, 0, 8, 8),
		uvRect(48, 0, 8, 8),
		uvRect(40, 8, 8, 8),
		uvRect(56, 8, 8, 8),
	];
}

function bodyOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(28, 36, 4, 12),
		uvRect(16, 36, 4, 12),
		uvRect(20, 32, 8, 4),
		uvRect(28, 32, 8, 4),
		uvRect(20, 36, 8, 12),
		uvRect(32, 36, 8, 12),
	];
}

function rightArmOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(48, 36, 4, 12),
		uvRect(40, 36, 4, 12),
		uvRect(44, 32, 4, 4),
		uvRect(48, 32, 4, 4),
		uvRect(44, 36, 4, 12),
		uvRect(52, 36, 4, 12),
	];
}

function leftArmOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(56, 52, 4, 12),
		uvRect(48, 52, 4, 12),
		uvRect(52, 48, 4, 4),
		uvRect(56, 48, 4, 4),
		uvRect(52, 52, 4, 12),
		uvRect(60, 52, 4, 12),
	];
}

function rightLegOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(8, 36, 4, 12),
		uvRect(0, 36, 4, 12),
		uvRect(4, 32, 4, 4),
		uvRect(8, 32, 4, 4),
		uvRect(4, 36, 4, 12),
		uvRect(12, 36, 4, 12),
	];
}

function leftLegOverlayUVs(): [number, number, number, number][] {
	return [
		uvRect(8, 52, 4, 12),
		uvRect(0, 52, 4, 12),
		uvRect(4, 48, 4, 4),
		uvRect(8, 48, 4, 4),
		uvRect(4, 52, 4, 12),
		uvRect(12, 52, 4, 12),
	];
}

/** A single box mesh with custom UVs from the skin texture. */
function SkinPart({
	position,
	size,
	uvs,
	texture,
	overlay,
}: {
	position: [number, number, number];
	size: [number, number, number];
	uvs: [number, number, number, number][];
	texture: THREE.Texture;
	overlay?: boolean;
}) {
	const geom = useMemo(() => {
		const g = new THREE.BoxGeometry(...size);
		applyBoxUVs(g, uvs);
		return g;
	}, [size, uvs]);

	const mat = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				map: texture,
				transparent: true,
				alphaTest: overlay ? 0.1 : 0,
				side: overlay ? THREE.DoubleSide : THREE.FrontSide,
			}),
		[texture, overlay],
	);

	return <mesh geometry={geom} material={mat} position={position} />;
}

// Scale: 1 unit = 1 pixel for readability, then group-scale down
const S = 1 / 8; // scale factor so head = 1 unit

function MinecraftPlayer({ skinDataUrl }: { skinDataUrl: string }) {
	const texture = useMemo(() => {
		const tex = new THREE.TextureLoader().load(skinDataUrl);
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
		tex.flipY = false;
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}, [skinDataUrl]);

	useEffect(() => {
		return () => {
			texture.dispose();
		};
	}, [texture]);

	// Positions relative to character center (feet at y=0)
	// All sizes in pixels, then scaled by S
	return (
		<group scale={[S, S, S]}>
			{/* Head: 8x8x8, center at y=28 (top of body at 24, + half head 4) */}
			<SkinPart
				position={[0, 28, 0]}
				size={[8, 8, 8]}
				uvs={headUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[0, 28, 0]}
				size={[9, 9, 9]}
				uvs={headOverlayUVs()}
				texture={texture}
				overlay
			/>

			{/* Body: 8x12x4, center at y=18 (legs 12 + half body 6) */}
			<SkinPart
				position={[0, 18, 0]}
				size={[8, 12, 4]}
				uvs={bodyUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[0, 18, 0]}
				size={[8.5, 12.5, 4.5]}
				uvs={bodyOverlayUVs()}
				texture={texture}
				overlay
			/>

			{/* Right Arm: 4x12x4, center at y=18, x=-6 */}
			<SkinPart
				position={[-6, 18, 0]}
				size={[4, 12, 4]}
				uvs={rightArmUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[-6, 18, 0]}
				size={[4.5, 12.5, 4.5]}
				uvs={rightArmOverlayUVs()}
				texture={texture}
				overlay
			/>

			{/* Left Arm: 4x12x4, center at y=18, x=+6 */}
			<SkinPart
				position={[6, 18, 0]}
				size={[4, 12, 4]}
				uvs={leftArmUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[6, 18, 0]}
				size={[4.5, 12.5, 4.5]}
				uvs={leftArmOverlayUVs()}
				texture={texture}
				overlay
			/>

			{/* Right Leg: 4x12x4, center at y=6, x=-2 */}
			<SkinPart
				position={[-2, 6, 0]}
				size={[4, 12, 4]}
				uvs={rightLegUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[-2, 6, 0]}
				size={[4.5, 12.5, 4.5]}
				uvs={rightLegOverlayUVs()}
				texture={texture}
				overlay
			/>

			{/* Left Leg: 4x12x4, center at y=6, x=+2 */}
			<SkinPart
				position={[2, 6, 0]}
				size={[4, 12, 4]}
				uvs={leftLegUVs()}
				texture={texture}
			/>
			<SkinPart
				position={[2, 6, 0]}
				size={[4.5, 12.5, 4.5]}
				uvs={leftLegOverlayUVs()}
				texture={texture}
				overlay
			/>
		</group>
	);
}

export interface MinecraftSkinViewerProps {
	skinDataUrl: string;
	width?: number;
	height?: number;
}

export default function MinecraftSkinViewer({
	skinDataUrl,
	width = 300,
	height = 400,
}: MinecraftSkinViewerProps) {
	return (
		<Canvas
			camera={{ position: [3, 2.5, 3], fov: 45 }}
			style={{ width, height }}
			gl={{ antialias: true, alpha: true }}>
			<ambientLight intensity={0.8} />
			<directionalLight position={[5, 5, 5]} intensity={0.6} />
			<MinecraftPlayer skinDataUrl={skinDataUrl} />
			<OrbitControls
				enablePan={false}
				enableZoom={false}
				target={[0, 2.5, 0]}
				minPolarAngle={Math.PI / 6}
				maxPolarAngle={(5 * Math.PI) / 6}
			/>
		</Canvas>
	);
}
