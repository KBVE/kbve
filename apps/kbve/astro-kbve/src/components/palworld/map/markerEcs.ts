import {
	createWorld,
	addEntity,
	removeEntity,
	addComponent,
	query,
} from 'bitecs';
import pois from './pois.json';

const MAIN_X0 = -1099400;
const MAIN_Y0 = -724400;
const MAIN_S = 1448800;

export function gameToUnits(gx: number, gy: number): [number, number] {
	const x = (256 * (gy - MAIN_Y0)) / MAIN_S;
	const yd = 256 * (1 - (gx - MAIN_X0) / MAIN_S);
	return [x, yd];
}

export const KIND = {
	fastTravel: 0,
	tower: 1,
	dungeon: 2,
	note: 3,
	skillFruit: 4,
	effigy: 5,
	egg: 6,
	boss: 7,
	crudeOil: 8,
	oilRig: 9,
	player: 10,
} as const;

export type KindName = keyof typeof KIND;

export const KIND_META: Record<
	KindName,
	{
		label: string;
		plural: string;
		icon: string;
		size: number;
		minZoom: number;
	}
> = {
	fastTravel: {
		label: 'Fast Travel',
		plural: 'Fast Travel',
		icon: '/palworld/ui/T_icon_compass_FTtower.png',
		size: 26,
		minZoom: 2,
	},
	tower: {
		label: 'Syndicate Tower',
		plural: 'Syndicate Towers',
		icon: '/palworld/ui/T_icon_compass_tower.png',
		size: 30,
		minZoom: 0,
	},
	dungeon: {
		label: 'Dungeon',
		plural: 'Dungeons',
		icon: '/palworld/ui/T_icon_compass_dungeon.png',
		size: 24,
		minZoom: 3,
	},
	note: {
		label: 'Journal Note',
		plural: 'Journal Notes',
		icon: '/palworld/ui/note-loc.png',
		size: 20,
		minZoom: 4,
	},
	skillFruit: {
		label: 'Skill Fruit Tree',
		plural: 'Skill Fruit Trees',
		icon: '/palworld/ui/fruit-loc.png',
		size: 22,
		minZoom: 4,
	},
	effigy: {
		label: 'Lifmunk Effigy',
		plural: 'Lifmunk Effigies',
		icon: '/palworld/ui/lifmunk_effigy.png',
		size: 16,
		minZoom: 5,
	},
	egg: {
		label: 'Egg',
		plural: 'Eggs',
		icon: '/palworld/ui/egg-loc.png',
		size: 22,
		minZoom: 4,
	},
	boss: {
		label: 'Alpha Boss',
		plural: 'Alpha Bosses',
		icon: '',
		size: 34,
		minZoom: 2,
	},
	crudeOil: {
		label: 'Crude Oil',
		plural: 'Crude Oil',
		icon: '/palworld/ui/oil-loc.webp',
		size: 18,
		minZoom: 4,
	},
	oilRig: {
		label: 'Oil Rig',
		plural: 'Oil Rigs',
		icon: '/palworld/ui/oil-rig.webp',
		size: 30,
		minZoom: 0,
	},
	player: {
		label: 'Player',
		plural: 'Players',
		icon: '',
		size: 14,
		minZoom: 0,
	},
};

export const RESPAWN_MINUTES: Partial<Record<KindName, number>> = {
	boss: 60,
	dungeon: 60,
};

export const Pos = { x: [] as number[], yd: [] as number[] };
export const Kind = { v: [] as number[] };
export const Marker = {};

export const labels: string[] = [];
export const iconKeys: string[] = [];

const prettyGrade = (g: string): string =>
	g
		.replace('worldtree', 'World Tree Egg')
		.replace(/_grade_0?(\d+)/, ' · Grade $1');

export function createMarkerWorld() {
	const world = createWorld();
	const spawn = (
		gx: number,
		gy: number,
		kind: number,
		label: string,
		iconKey: string,
	) => {
		const eid = addEntity(world);
		addComponent(world, eid, Marker);
		addComponent(world, eid, Pos);
		addComponent(world, eid, Kind);
		const [x, yd] = gameToUnits(gx, gy);
		Pos.x[eid] = x;
		Pos.yd[eid] = yd;
		Kind.v[eid] = kind;
		labels[eid] = label;
		iconKeys[eid] = iconKey;
	};
	for (const [x, y] of pois.fastTravel)
		spawn(x, y, KIND.fastTravel, 'Fast Travel', '');
	for (const [x, y] of pois.tower)
		spawn(x, y, KIND.tower, 'Syndicate Tower', '');
	for (const [x, y, type] of pois.dungeon as [number, number, string][])
		spawn(x, y, KIND.dungeon, type ? `${type} Dungeon` : 'Dungeon', '');
	for (const [x, y] of pois.note) spawn(x, y, KIND.note, 'Journal Note', '');
	for (const [x, y] of pois.skillFruit)
		spawn(x, y, KIND.skillFruit, 'Skill Fruit Tree', '');
	for (const [x, y] of pois.effigy)
		spawn(x, y, KIND.effigy, 'Lifmunk Effigy', '');
	for (const [x, y, grade] of pois.egg as [number, number, string][])
		spawn(x, y, KIND.egg, prettyGrade(grade), '');
	for (const [x, y] of pois.crudeOil)
		spawn(x, y, KIND.crudeOil, 'Crude Oil', '');
	for (const [x, y, lv] of pois.oilRig)
		spawn(x, y, KIND.oilRig, `Oil Rig · Lv ${lv}`, '');
	for (const b of pois.boss)
		spawn(
			b.x,
			b.y,
			KIND.boss,
			`${b.name} · Lv ${b.lv}`,
			`/palworld/palicons/${b.icon}.webp`,
		);
	return world;
}

export type MarkerWorld = ReturnType<typeof createMarkerWorld>;

export function markerEntities(world: MarkerWorld): readonly number[] {
	return Array.from(query(world, [Marker, Pos, Kind]));
}

export interface LivePlayer {
	name: string;
	level: number;
	x: number;
	y: number;
}

export const lerpFrom = { x: [] as number[], yd: [] as number[] };
export const lerpStart: number[] = [];
const playerEids = new Map<string, number>();

export function syncPlayers(
	world: MarkerWorld,
	players: LivePlayer[],
	now: number,
): void {
	const seen = new Set<string>();
	for (const p of players) {
		seen.add(p.name);
		const [x, yd] = gameToUnits(p.x, p.y);
		let eid = playerEids.get(p.name);
		if (eid === undefined) {
			eid = addEntity(world);
			addComponent(world, eid, Marker);
			addComponent(world, eid, Pos);
			addComponent(world, eid, Kind);
			Kind.v[eid] = KIND.player;
			Pos.x[eid] = x;
			Pos.yd[eid] = yd;
			lerpFrom.x[eid] = x;
			lerpFrom.yd[eid] = yd;
			playerEids.set(p.name, eid);
		} else {
			lerpFrom.x[eid] = Pos.x[eid];
			lerpFrom.yd[eid] = Pos.yd[eid];
		}
		Pos.x[eid] = x;
		Pos.yd[eid] = yd;
		lerpStart[eid] = now;
		labels[eid] = `${p.name} · Lv ${p.level}`;
	}
	for (const [name, eid] of playerEids) {
		if (!seen.has(name)) {
			removeEntity(world, eid);
			playerEids.delete(name);
		}
	}
}
