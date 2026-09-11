import { useEffect, useState } from 'react';
import {
	get_hovered_object_json,
	get_player_state_json,
} from '../../wasm-pkg/isometric_game.js';
import type { InteractableKind } from '../ui/events/event-map';

type Position = [number, number, number];

// Must match camera.rs constants
const CAMERA_OFFSET: Position = [15.0, 20.0, 15.0];
const VIEWPORT_HEIGHT = 20.0;

// Precompute stable camera axes (same as Rust StableCameraAxes)
// Transform::from_translation(CAMERA_OFFSET).looking_at(Vec3::ZERO, Vec3::Y)
function computeCameraAxes() {
	// Forward = normalize(target - eye) = normalize(-CAMERA_OFFSET)
	const fwd = [-CAMERA_OFFSET[0], -CAMERA_OFFSET[1], -CAMERA_OFFSET[2]];
	const fwdLen = Math.sqrt(fwd[0] ** 2 + fwd[1] ** 2 + fwd[2] ** 2);
	fwd[0] /= fwdLen;
	fwd[1] /= fwdLen;
	fwd[2] /= fwdLen;

	// Right = normalize(forward × up_world)
	const up = [0, 1, 0];
	const right = [
		fwd[1] * up[2] - fwd[2] * up[1],
		fwd[2] * up[0] - fwd[0] * up[2],
		fwd[0] * up[1] - fwd[1] * up[0],
	];
	const rLen = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
	right[0] /= rLen;
	right[1] /= rLen;
	right[2] /= rLen;

	// Camera up = normalize(right × forward)
	const camUp = [
		right[1] * fwd[2] - right[2] * fwd[1],
		right[2] * fwd[0] - right[0] * fwd[2],
		right[0] * fwd[1] - right[1] * fwd[0],
	];

	return { right, up: camUp, forward: fwd };
}

const AXES = computeCameraAxes();

function dot(a: number[], b: number[]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Project a world position to screen pixel coordinates. */
function worldToScreen(
	worldPos: Position,
	cameraPos: Position,
	windowW: number,
	windowH: number,
): { x: number; y: number } | null {
	const rel = [
		worldPos[0] - cameraPos[0],
		worldPos[1] - cameraPos[1],
		worldPos[2] - cameraPos[2],
	];

	const halfH = VIEWPORT_HEIGHT / 2;
	const aspect = windowW / windowH;
	const halfW = halfH * aspect;

	const ndcX = dot(rel, AXES.right) / halfW;
	const ndcY = dot(rel, AXES.up) / halfH;

	// Behind camera or outside frustum
	if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) return null;

	return {
		x: ((ndcX + 1) / 2) * windowW,
		y: ((1 - ndcY) / 2) * windowH,
	};
}

const OBJECT_NAMES: Record<InteractableKind, string> = {
	tree: 'Tree',
	crate: 'Wooden Crate',
	crystal: 'Crystal',
	pillar: 'Stone Pillar',
	sphere: 'Metallic Sphere',
	flower: 'Flower',
	rock: 'Rock',
	mushroom: 'Mushroom',
};

const FLOWER_NAMES: Record<string, string> = {
	tulip: 'Tulip',
	daisy: 'Daisy',
	lavender: 'Lavender',
	bell: 'Bellflower',
	wildflower: 'Wildflower',
	sunflower: 'Sunflower',
	rose: 'Rose',
	cornflower: 'Cornflower',
	allium: 'Allium',
	blue_orchid: 'Blue Orchid',
};

const ROCK_NAMES: Record<string, string> = {
	boulder: 'Boulder',
	mossy_rock: 'Mossy Rock',
	ore_copper: 'Copper Ore',
	ore_iron: 'Iron Ore',
	ore_crystal: 'Crystal Ore',
};

const MUSHROOM_NAMES: Record<string, string> = {
	porcini: 'Porcini',
	chanterelle: 'Chanterelle',
	fly_agaric: 'Fly Agaric',
};

interface HoveredData {
	name: string;
	screenX: number;
	screenY: number;
}

export function ObjectLabel() {
	const [hovered, setHovered] = useState<HoveredData | null>(null);

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				const json = get_hovered_object_json();
				if (!json) {
					setHovered(null);
					return;
				}

				const obj = JSON.parse(json) as {
					kind: InteractableKind;
					position: Position;
					sub_kind?: string;
				};

				// Get player position to derive camera position
				const playerJson = get_player_state_json();
				if (!playerJson) {
					setHovered(null);
					return;
				}
				const player = JSON.parse(playerJson) as {
					position: Position;
				};

				const camPos: Position = [
					player.position[0] + CAMERA_OFFSET[0],
					player.position[1] + CAMERA_OFFSET[1],
					player.position[2] + CAMERA_OFFSET[2],
				];

				// Offset label above the object
				const labelPos: Position = [
					obj.position[0],
					obj.position[1] + 1.5,
					obj.position[2],
				];

				const screen = worldToScreen(
					labelPos,
					camPos,
					window.innerWidth,
					window.innerHeight,
				);
				if (!screen) {
					setHovered(null);
					return;
				}

				let name = OBJECT_NAMES[obj.kind] ?? obj.kind;
				if (obj.kind === 'flower' && obj.sub_kind) {
					name = FLOWER_NAMES[obj.sub_kind] ?? name;
				}
				if (obj.kind === 'rock' && obj.sub_kind) {
					name = ROCK_NAMES[obj.sub_kind] ?? name;
				}
				if (obj.kind === 'mushroom' && obj.sub_kind) {
					name = MUSHROOM_NAMES[obj.sub_kind] ?? name;
				}

				setHovered({
					name,
					screenX: screen.x,
					screenY: screen.y,
				});
			} catch {
				setHovered(null);
			}
		}, 50);

		return () => clearInterval(interval);
	}, []);

	if (!hovered) return null;

	return (
		<div
			className="absolute pointer-events-none"
			style={{
				left: hovered.screenX,
				top: hovered.screenY,
				transform: 'translate(-50%, -100%)',
			}}>
			<div
				className="px-2 py-1 md:px-3 md:py-1.5 bg-[#1e1408]/90 border border-panel-border
					text-[7px] md:text-[10px] text-[#c8a832] whitespace-nowrap">
				{hovered.name}
			</div>
		</div>
	);
}
