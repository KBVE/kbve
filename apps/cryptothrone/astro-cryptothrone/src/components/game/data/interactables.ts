/**
 * Per-zone interactable registry.
 *
 * Static, sprite-less points of interest (signs, statues, wells) defined as map
 * regions. They open a dialog ONLY when the player explicitly interacts (E /
 * click) while standing in the region — never automatically on walk-through.
 * Keyed by zone (see data/zones.ts) so each map carries its own; adding one is
 * a data edit here.
 */

export interface InteractBounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

export interface Interactable {
	/** Stable id. */
	ref: string;
	/** Tile region that counts as "at" this interactable. */
	bounds: InteractBounds;
	/** Dialog body shown on interact. */
	message: string;
	/** Speaker name in the dialog header. */
	name?: string;
	/** Portrait shown beside the dialog. */
	characterImage?: string;
	/** Full-bleed dialog background. */
	backgroundImage?: string;
}

const ZONE_INTERACTABLES: Record<string, Interactable[]> = {
	'cloud-city': [
		{
			ref: 'well',
			bounds: { xMin: 2, xMax: 5, yMin: 10, yMax: 14 },
			message:
				'Seems like there are no fish in the sand pits. This area could be fixed up a bit.',
		},
		{
			ref: 'sign',
			bounds: { xMin: 2, xMax: 5, yMin: 2, yMax: 5 },
			name: 'Wooden Sign',
			message: 'Welcome to Cloud City!',
			backgroundImage: '/assets/background/woodensign.webp',
		},
		{
			ref: 'tombstone',
			bounds: { xMin: 7, xMax: 10, yMin: 9, yMax: 10 },
			name: 'Samson Statue',
			message:
				'Samson the Great was an amazing sailor, died drinking dat drank.',
			characterImage: '/assets/npc/samson.png',
			backgroundImage: '/assets/background/animetombstone.webp',
		},
	],
};

export function getZoneInteractables(zoneKey: string): Interactable[] {
	return ZONE_INTERACTABLES[zoneKey] ?? [];
}

export function interactableAt(
	list: Interactable[],
	x: number,
	y: number,
): Interactable | undefined {
	return list.find(
		(it) =>
			x >= it.bounds.xMin &&
			x <= it.bounds.xMax &&
			y >= it.bounds.yMin &&
			y <= it.bounds.yMax,
	);
}
