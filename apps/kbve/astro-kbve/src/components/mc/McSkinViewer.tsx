import * as THREE from 'three';
import { useMemo, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

interface McSkinViewerProps {
	uuid: string;
	skinUrl?: string | null;
	width?: number;
	height?: number;
}

// ---------------------------------------------------------------------------
// UV helpers (ported from working MinecraftSkin.tsx in apps/mc)
// ---------------------------------------------------------------------------

/**
 * Converts a pixel rect on the 64×64 skin into UV bounds [u0, v0, u1, v1].
 * With flipY=false: image row 0 (top of PNG) → V=0, row 63 → V=1.
 */
function uvRect(
	x: number,
	y: number,
	w: number,
	h: number,
	texW = 64,
	texH = 64,
): [number, number, number, number] {
	return [x / texW, y / texH, (x + w) / texW, (y + h) / texH];
}

/**
 * Applies per-face UVs to a BoxGeometry.
 * Face order: +X, -X, +Y, -Y, +Z, -Z
 * Each face has 4 vertices: top-left, top-right, bottom-left, bottom-right.
 */
function applyBoxUVs(
	geom: THREE.BoxGeometry,
	faceUVs: [number, number, number, number][],
): void {
	const uvAttr = geom.attributes.uv as THREE.BufferAttribute;
	for (let face = 0; face < 6; face++) {
		const [u0, v0, u1, v1] = faceUVs[face];
		const base = face * 4;
		uvAttr.setXY(base + 0, u0, v0);
		uvAttr.setXY(base + 1, u1, v0);
		uvAttr.setXY(base + 2, u0, v1);
		uvAttr.setXY(base + 3, u1, v1);
	}
	uvAttr.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Inner-layer UV definitions
// ---------------------------------------------------------------------------

function headUVs(): [number, number, number, number][] {
	return [
		uvRect(16, 8, 8, 8),
		uvRect(0, 8, 8, 8),
		uvRect(8, 0, 8, 8),
		uvRect(16, 0, 8, 8),
		uvRect(8, 8, 8, 8),
		uvRect(24, 8, 8, 8),
	];
}

function bodyUVs(): [number, number, number, number][] {
	return [
		uvRect(28, 20, 4, 12),
		uvRect(16, 20, 4, 12),
		uvRect(20, 16, 8, 4),
		uvRect(28, 16, 8, 4),
		uvRect(20, 20, 8, 12),
		uvRect(32, 20, 8, 12),
	];
}

function rightArmUVs(): [number, number, number, number][] {
	return [
		uvRect(48, 20, 4, 12),
		uvRect(40, 20, 4, 12),
		uvRect(44, 16, 4, 4),
		uvRect(48, 16, 4, 4),
		uvRect(44, 20, 4, 12),
		uvRect(52, 20, 4, 12),
	];
}

function leftArmUVs(): [number, number, number, number][] {
	return [
		uvRect(40, 52, 4, 12),
		uvRect(32, 52, 4, 12),
		uvRect(36, 48, 4, 4),
		uvRect(40, 48, 4, 4),
		uvRect(36, 52, 4, 12),
		uvRect(44, 52, 4, 12),
	];
}

function rightLegUVs(): [number, number, number, number][] {
	return [
		uvRect(8, 20, 4, 12),
		uvRect(0, 20, 4, 12),
		uvRect(4, 16, 4, 4),
		uvRect(8, 16, 4, 4),
		uvRect(4, 20, 4, 12),
		uvRect(12, 20, 4, 12),
	];
}

function leftLegUVs(): [number, number, number, number][] {
	return [
		uvRect(24, 52, 4, 12),
		uvRect(16, 52, 4, 12),
		uvRect(20, 48, 4, 4),
		uvRect(24, 48, 4, 4),
		uvRect(20, 52, 4, 12),
		uvRect(28, 52, 4, 12),
	];
}

// ---------------------------------------------------------------------------
// Outer-layer (overlay) UV definitions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Skin part mesh component
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full player model (inner + overlay layers)
// ---------------------------------------------------------------------------

const S = 1 / 8;

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

	return (
		<group scale={[S, S, S]}>
			{/* Head */}
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

			{/* Body */}
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

			{/* Right Arm */}
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

			{/* Left Arm */}
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

			{/* Right Leg */}
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

			{/* Left Leg */}
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

// ---------------------------------------------------------------------------
// Skin data URL fetching (via KBVE Axum texture proxy)
// ---------------------------------------------------------------------------

function extractTextureHash(url: string): string | null {
	const match = url.match(/\/texture\/([0-9a-f]{60,64})$/i);
	return match ? match[1] : null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}

async function fetchSkinAsDataUrl(
	_uuid: string,
	skinUrl?: string | null,
): Promise<string | null> {
	if (!skinUrl) return null;

	const hash = extractTextureHash(skinUrl);
	if (!hash) return null;

	try {
		const res = await fetch(`/api/v1/mc/textures/${hash}`);
		if (!res.ok) return null;
		const blob = await res.blob();
		return blobToDataUrl(blob);
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Exported viewer component
// ---------------------------------------------------------------------------

export default function McSkinViewer({
	uuid,
	skinUrl,
	width = 300,
	height = 400,
}: McSkinViewerProps) {
	const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setSkinDataUrl(null);
		setFailed(false);

		let cancelled = false;
		fetchSkinAsDataUrl(uuid, skinUrl).then((url) => {
			if (cancelled) return;
			if (url) {
				setSkinDataUrl(url);
			} else {
				setFailed(true);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [uuid, skinUrl]);

	if (failed) {
		return (
			<div
				style={{
					width,
					height,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'var(--sl-color-gray-3, #71717a)',
					fontSize: '0.875rem',
				}}>
				Could not load skin
			</div>
		);
	}

	if (!skinDataUrl) {
		return (
			<div
				style={{
					width,
					height,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'var(--sl-color-gray-3, #71717a)',
					fontSize: '0.875rem',
				}}>
				Loading skin...
			</div>
		);
	}

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
