import type { LocaleMessages } from '@kbve/laser';

export const ARPG_I18N_NS = 'arpg';

export const en: LocaleMessages = {
	'arpg.hud.hp.label': 'HP',
	'arpg.hud.hp.name': 'Health',
	'arpg.hud.mp.label': 'MP',
	'arpg.hud.mp.name': 'Mana',
	'arpg.hud.ep.label': 'EP',
	'arpg.hud.ep.name': 'Energy',
	'arpg.hud.sp.label': 'SP',
	'arpg.hud.sp.name': 'Stamina',
	'arpg.hud.orb.value': '{cur} / {max}',
	'arpg.hud.orb.pct': '{pct}%',

	'arpg.hud.minimap.title': 'Map',

	'arpg.inventory.title': 'Inventory',
	'arpg.inventory.empty': 'Empty — walk over loot to pick it up.',
	'arpg.inventory.hint':
		'Drag to reorder · double-click to use · 1-9 hotkeys',
	'arpg.inventory.useTitle': 'Use {name} · drag to organize',
	'arpg.inventory.dropFloor': 'Drag here to drop to the floor',

	'arpg.compass.n': 'N',
	'arpg.compass.e': 'E',
	'arpg.compass.s': 'S',
	'arpg.compass.w': 'W',

	'arpg.debug.fps': '{fps} fps',
	'arpg.debug.tile': '{x},{y}',
};
