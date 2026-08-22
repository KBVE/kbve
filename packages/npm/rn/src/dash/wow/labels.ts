export const WOW_NODE_ORDER = ['gateway', 'worldserver'];

export type WowNodeRole = 'gateway' | 'worldserver' | 'unknown';

const CLASS_NAMES: Record<number, string> = {
	1: 'Warrior',
	2: 'Paladin',
	3: 'Hunter',
	4: 'Rogue',
	5: 'Priest',
	6: 'Death Knight',
	7: 'Shaman',
	8: 'Mage',
	9: 'Warlock',
	11: 'Druid',
};

const RACE_NAMES: Record<number, string> = {
	1: 'Human',
	2: 'Orc',
	3: 'Dwarf',
	4: 'Night Elf',
	5: 'Undead',
	6: 'Tauren',
	7: 'Gnome',
	8: 'Troll',
	9: 'Goblin',
	10: 'Blood Elf',
	11: 'Draenei',
};

const ALLIANCE_RACES = new Set([1, 3, 4, 7, 11]);

const ZONE_NAMES: Record<number, string> = {
	1: 'Dun Morogh',
	3: 'Badlands',
	12: 'Elwynn Forest',
	14: 'Durotar',
	15: 'Dustwallow Marsh',
	17: 'The Barrens',
	33: 'Stranglethorn Vale',
	38: 'Loch Modan',
	40: 'Westfall',
	41: 'Deadwind Pass',
	44: 'Redridge Mountains',
	45: 'Arathi Highlands',
	85: 'Tirisfal Glades',
	130: 'Silverpine Forest',
	141: 'Teldrassil',
	148: 'Darkshore',
	215: 'Mulgore',
	1497: 'Undercity',
	1519: 'Stormwind City',
	1537: 'Ironforge',
	1637: 'Orgrimmar',
	1638: 'Thunder Bluff',
	1657: 'Darnassus',
	3430: 'Eversong Woods',
	3433: 'Ghostlands',
	3487: 'Silvermoon City',
	3524: 'Azuremyst Isle',
	3525: 'Bloodmyst Isle',
	3557: 'The Exodar',
	3703: 'Shattrath City',
	4395: 'Dalaran',
	3537: 'Borean Tundra',
	65: 'Dragonblight',
	66: 'Zul’Drak',
	67: 'The Storm Peaks',
	210: 'Icecrown',
	394: 'Grizzly Hills',
	495: 'Howling Fjord',
	2817: 'Crystalsong Forest',
	3711: 'Sholazar Basin',
	4197: 'Wintergrasp',
};

const MAP_NAMES: Record<number, string> = {
	0: 'Eastern Kingdoms',
	1: 'Kalimdor',
	530: 'Outland',
	571: 'Northrend',
};

export function className(id: number): string {
	return CLASS_NAMES[id] ?? `Class ${id}`;
}

export function raceName(id: number): string {
	return RACE_NAMES[id] ?? `Race ${id}`;
}

export function factionOf(raceId: number): 'Alliance' | 'Horde' {
	return ALLIANCE_RACES.has(raceId) ? 'Alliance' : 'Horde';
}

export function zoneName(id: number): string {
	return ZONE_NAMES[id] ?? `Zone ${id}`;
}

export function mapName(id: number): string {
	return MAP_NAMES[id] ?? `Map ${id}`;
}

export function genderName(id: number): string {
	return id === 1 ? 'Female' : 'Male';
}

/** realmlist `icon` column: 0 Normal, 1 PvP, 6 RP, 8 RP-PvP. */
export function realmTypeName(icon: number): string {
	if (icon === 1) return 'PvP';
	if (icon === 6) return 'RP';
	if (icon === 8) return 'RP-PvP';
	return 'Normal';
}

export function nodeRoleFromPod(pod: string): WowNodeRole {
	if (pod.startsWith('tocloud9-worldserver')) return 'worldserver';
	if (pod.startsWith('tocloud9-gateway')) return 'gateway';
	return 'unknown';
}

export function nodeRoleRank(role: WowNodeRole): number {
	const i = WOW_NODE_ORDER.indexOf(role);
	return i === -1 ? WOW_NODE_ORDER.length : i;
}
