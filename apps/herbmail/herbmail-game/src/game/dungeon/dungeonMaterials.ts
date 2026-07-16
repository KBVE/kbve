import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { PsxMaterialImpl } from '../render/PsxMaterial';
import { TINT } from '../config';
import { useDungeonTextures, type WallMaps } from '../textures';

export interface DungeonMaterials {
	walls: PsxMaterialImpl[];
	arch: PsxMaterialImpl;
	trim: PsxMaterialImpl;
	floor: PsxMaterialImpl;
	ceiling: PsxMaterialImpl;
	cove: PsxMaterialImpl;
	corner: PsxMaterialImpl;
	dome: PsxMaterialImpl;
	bayFrame: PsxMaterialImpl;
	bayBack: PsxMaterialImpl;
}

type PsxUniforms = Partial<{
	uMap: THREE.Texture;
	uNormalMap: THREE.Texture;
	uHarMap: THREE.Texture;
	uUseMaps: number;
	uPom: number;
	uTint: THREE.Color;
	uOcclude: number;
	uAffine: number;
}>;

function makeMat(
	uniforms: PsxUniforms,
	opts?: {
		doubleSide?: boolean;
		polygonOffsetFactor?: number;
	},
): PsxMaterialImpl {
	const m = new PsxMaterialImpl();
	Object.assign(m, uniforms);
	if (opts?.doubleSide) m.side = THREE.DoubleSide;
	if (opts?.polygonOffsetFactor !== undefined) {
		m.polygonOffset = true;
		m.polygonOffsetFactor = opts.polygonOffsetFactor;
		m.polygonOffsetUnits = opts.polygonOffsetFactor;
	}
	return m;
}

function wallUniforms(maps: WallMaps): PsxUniforms {
	return {
		uMap: maps.color,
		uNormalMap: maps.normal,
		uHarMap: maps.har,
		uUseMaps: 1,
	};
}

export function useDungeonMaterials(
	snap: number,
	affine: number,
): DungeonMaterials {
	const tex = useDungeonTextures();
	const size = useThree((s) => s.size);

	const mats = useMemo(() => {
		const tint = (t: readonly number[]) => new THREE.Color(...t);
		return {
			walls: tex.walls.map((w) =>
				makeMat({ ...wallUniforms(w), uPom: 1 }),
			),
			arch: makeMat({
				...wallUniforms(tex.arch),
				uPom: 1,
				uTint: tint(TINT.arch),
			}),
			trim: makeMat({
				...wallUniforms(tex.trim),
				uPom: 0,
				uTint: tint(TINT.trim),
			}),
			floor: makeMat({ uMap: tex.floor, uTint: tint(TINT.floor) }),
			ceiling: makeMat({ uMap: tex.ceiling, uTint: tint(TINT.ceiling) }),
			cove: makeMat(
				{ ...wallUniforms(tex.walls[2]), uTint: tint(TINT.cove) },
				{ doubleSide: true, polygonOffsetFactor: -2 },
			),
			corner: makeMat(
				{ ...wallUniforms(tex.walls[2]), uTint: tint(TINT.cove) },
				{ doubleSide: true, polygonOffsetFactor: -4 },
			),
			dome: makeMat(
				{ ...wallUniforms(tex.walls[2]), uPom: 0 },
				{ doubleSide: true },
			),
			bayFrame: makeMat(
				{ uMap: tex.arch.color, uTint: tint(TINT.bay) },
				{ doubleSide: true, polygonOffsetFactor: -3 },
			),
			bayBack: makeMat(
				{ uMap: tex.arch.color, uTint: tint(TINT.bayBack) },
				{ doubleSide: true },
			),
		};
	}, [tex]);

	useEffect(() => {
		const all = [
			...mats.walls,
			mats.arch,
			mats.trim,
			mats.floor,
			mats.ceiling,
			mats.cove,
			mats.corner,
			mats.dome,
			mats.bayFrame,
			mats.bayBack,
		];
		const flat = new Set([mats.arch, mats.bayFrame, mats.bayBack]);
		for (const m of all) {
			m.uSnap = snap;
			m.uAffine = flat.has(m) ? 0 : affine;
			(m.uRes as THREE.Vector2).set(size.width, size.height);
		}
	}, [mats, snap, affine, size]);

	useEffect(() => {
		return () => {
			for (const m of [
				...mats.walls,
				mats.arch,
				mats.trim,
				mats.floor,
				mats.ceiling,
				mats.cove,
				mats.corner,
				mats.dome,
				mats.bayFrame,
				mats.bayBack,
			]) {
				m.dispose();
			}
		};
	}, [mats]);

	return mats;
}
