export type Enchant = {
	id: string;
	level: number;
};

type EnchantDef = {
	id: string;
	label: string;
	maxLevel: number;
	curse?: boolean;
	treasure?: boolean;
};

export const VANILLA_ENCHANTS: EnchantDef[] = [
	{ id: 'aqua_affinity', label: 'Aqua Affinity', maxLevel: 1 },
	{ id: 'bane_of_arthropods', label: 'Bane of Arthropods', maxLevel: 5 },
	{
		id: 'binding_curse',
		label: 'Curse of Binding',
		maxLevel: 1,
		curse: true,
	},
	{ id: 'blast_protection', label: 'Blast Protection', maxLevel: 4 },
	{ id: 'breach', label: 'Breach', maxLevel: 4 },
	{ id: 'channeling', label: 'Channeling', maxLevel: 1 },
	{ id: 'density', label: 'Density', maxLevel: 5 },
	{ id: 'depth_strider', label: 'Depth Strider', maxLevel: 3 },
	{ id: 'efficiency', label: 'Efficiency', maxLevel: 5 },
	{ id: 'feather_falling', label: 'Feather Falling', maxLevel: 4 },
	{ id: 'fire_aspect', label: 'Fire Aspect', maxLevel: 2 },
	{ id: 'fire_protection', label: 'Fire Protection', maxLevel: 4 },
	{ id: 'flame', label: 'Flame', maxLevel: 1 },
	{ id: 'fortune', label: 'Fortune', maxLevel: 3 },
	{ id: 'frost_walker', label: 'Frost Walker', maxLevel: 2, treasure: true },
	{ id: 'impaling', label: 'Impaling', maxLevel: 5 },
	{ id: 'infinity', label: 'Infinity', maxLevel: 1 },
	{ id: 'knockback', label: 'Knockback', maxLevel: 2 },
	{ id: 'looting', label: 'Looting', maxLevel: 3 },
	{ id: 'loyalty', label: 'Loyalty', maxLevel: 3 },
	{ id: 'luck_of_the_sea', label: 'Luck of the Sea', maxLevel: 3 },
	{ id: 'lure', label: 'Lure', maxLevel: 3 },
	{ id: 'mending', label: 'Mending', maxLevel: 1, treasure: true },
	{ id: 'multishot', label: 'Multishot', maxLevel: 1 },
	{ id: 'piercing', label: 'Piercing', maxLevel: 4 },
	{ id: 'power', label: 'Power', maxLevel: 5 },
	{
		id: 'projectile_protection',
		label: 'Projectile Protection',
		maxLevel: 4,
	},
	{ id: 'protection', label: 'Protection', maxLevel: 4 },
	{ id: 'punch', label: 'Punch', maxLevel: 2 },
	{ id: 'quick_charge', label: 'Quick Charge', maxLevel: 3 },
	{ id: 'respiration', label: 'Respiration', maxLevel: 3 },
	{ id: 'riptide', label: 'Riptide', maxLevel: 3 },
	{ id: 'sharpness', label: 'Sharpness', maxLevel: 5 },
	{ id: 'silk_touch', label: 'Silk Touch', maxLevel: 1 },
	{ id: 'smite', label: 'Smite', maxLevel: 5 },
	{ id: 'soul_speed', label: 'Soul Speed', maxLevel: 3, treasure: true },
	{ id: 'sweeping_edge', label: 'Sweeping Edge', maxLevel: 3 },
	{ id: 'swift_sneak', label: 'Swift Sneak', maxLevel: 3, treasure: true },
	{ id: 'thorns', label: 'Thorns', maxLevel: 3 },
	{ id: 'unbreaking', label: 'Unbreaking', maxLevel: 3 },
	{
		id: 'vanishing_curse',
		label: 'Curse of Vanishing',
		maxLevel: 1,
		curse: true,
	},
	{ id: 'wind_burst', label: 'Wind Burst', maxLevel: 3, treasure: true },
];

const ENCHANT_INDEX: Map<string, EnchantDef> = new Map(
	VANILLA_ENCHANTS.map((e) => [e.id, e]),
);

export function enchantLabel(id: string): string {
	return (
		ENCHANT_INDEX.get(id)?.label ??
		id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	);
}

export function enchantDef(id: string): EnchantDef | undefined {
	return ENCHANT_INDEX.get(id);
}

const ROMAN: Record<number, string> = {
	1: 'I',
	2: 'II',
	3: 'III',
	4: 'IV',
	5: 'V',
	6: 'VI',
	7: 'VII',
	8: 'VIII',
	9: 'IX',
	10: 'X',
};

export function roman(n: number): string {
	if (n in ROMAN) return ROMAN[n];
	return String(n);
}

export function formatEnchant(e: Enchant): string {
	const label = enchantLabel(e.id);
	if (e.level <= 1 && (enchantDef(e.id)?.maxLevel ?? 1) === 1) return label;
	return `${label} ${roman(e.level)}`;
}

export function parseEnchants(itemRef: unknown): Enchant[] {
	if (!itemRef || typeof itemRef !== 'object') return [];
	const raw = (itemRef as { enchants?: unknown }).enchants;
	if (!Array.isArray(raw)) return [];
	const out: Enchant[] = [];
	for (const e of raw) {
		if (!e || typeof e !== 'object') continue;
		const id = (e as { id?: unknown }).id;
		const level = (e as { level?: unknown }).level;
		if (typeof id !== 'string' || !id) continue;
		const lvl =
			typeof level === 'number' && Number.isFinite(level)
				? Math.max(1, Math.floor(level))
				: 1;
		out.push({ id, level: lvl });
	}
	return out;
}
