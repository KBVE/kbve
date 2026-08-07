export type ArcadeStatus = 'live' | 'beta' | 'soon';

export interface ArcadeGame {
	slug: string;
	/** Registry glyph used by the section rail (see @kbve/rn/icons). */
	navIcon: string;
	title: string;
	href: string;
	description: string;
	tags: string[];
	status: ArcadeStatus;
	gradient: string;
	icon: string;
}

export const ARCADE_STATUS_LABEL: Record<ArcadeStatus, string> = {
	live: 'Play now',
	beta: 'In beta',
	soon: 'Coming soon',
};

/**
 * Single source of truth for the arcade catalog: drives the hub cards, the
 * section rail, and the coverage stats. Adding a game here wires all three.
 */
export const ARCADE_GAMES: ArcadeGame[] = [
	{
		slug: 'tactics',
		navIcon: 'kanban',
		title: 'Frontline Grid',
		href: '/arcade/tactics/',
		description:
			'Compact turn-based tactics on an 8×8 battlefield. Move blue command units across terrain, focus fire, survive red counter turns, and clear the convoy guard.',
		tags: ['Tactics', 'Strategy', 'React'],
		status: 'live',
		gradient: 'linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%)',
		icon: '▦',
	},
	{
		slug: 'blackjack',
		navIcon: 'gem',
		title: 'Blackjack',
		href: '/arcade/blackjack/',
		description:
			'Classic single-player blackjack against the dealer. Set your wager, hit, stand, double down, and manage a finite bankroll through a four-deck shoe.',
		tags: ['Cards', 'Casino', 'Phaser'],
		status: 'live',
		gradient: 'linear-gradient(135deg, #14532d 0%, #7f1d1d 100%)',
		icon: '♣',
	},
	{
		slug: 'solitaire',
		navIcon: 'layers',
		title: 'Solitaire',
		href: '/arcade/solitaire/',
		description:
			'Klondike with a roguelite twist — bonus HP/cash cards, monster encounters pulled from npcdb, frozen-card status, and a Balatro-style blind/shop loop.',
		tags: ['Cards', 'Roguelite', 'Phaser'],
		status: 'live',
		gradient: 'linear-gradient(135deg, #065f46 0%, #1e3a8a 100%)',
		icon: '♠',
	},
	{
		slug: 'towerdefense',
		navIcon: 'shield',
		title: 'Tower Defense',
		href: '/arcade/towerdefense/',
		description:
			'Procedurally-generated map, ECS sim with armor + status effects, repair drones, archers, card rewards between waves, and a Call for Ally Nation item. Hold the line through 20+ waves, then 5-card rewards kick in.',
		tags: ['Tower Defense', 'Strategy', 'Phaser', 'ECS'],
		status: 'live',
		gradient: 'linear-gradient(135deg, #b45309 0%, #166534 100%)',
		icon: '✛',
	},
	{
		slug: 'runner',
		navIcon: 'zap',
		title: 'Endless Runner',
		href: '/arcade/runner/',
		description:
			'A quick endless-runner palette cleanser. Pick up speed, dodge what you can, see how far you get.',
		tags: ['Action', 'Arcade', 'R3F'],
		status: 'live',
		gradient: 'linear-gradient(135deg, #f59e0b 0%, #b91c1c 100%)',
		icon: '➤',
	},
	{
		slug: 'arpg',
		navIcon: 'gamepad',
		title: 'ARPG',
		href: '/arcade/arpg/',
		description:
			'Diablo-style multiplayer isometric action RPG built on Phaser 4 and @kbve/laser. Party up, clear floors, and push deeper.',
		tags: ['Action RPG', 'Multiplayer', 'Phaser'],
		status: 'beta',
		gradient: 'linear-gradient(135deg, #7f1d1d 0%, #312e81 100%)',
		icon: '⚔',
	},
	{
		slug: 'rareicon',
		navIcon: 'sparkles',
		title: 'RareIcon (WebGL)',
		href: '/arcade/rareicon/',
		description:
			'A playable demo of RareIcon — our 2D sci-fi action-RPG bullet-hell roguelite. Chip vs DaemonCorps, in your browser.',
		tags: ['Action RPG', 'Bullet hell', 'WebGL'],
		status: 'beta',
		gradient: 'linear-gradient(135deg, #7c3aed 0%, #be185d 100%)',
		icon: '✦',
	},
	{
		slug: 'isometric',
		navIcon: 'cube',
		title: 'Isometric',
		href: '/arcade/isometric/',
		description:
			"WebGPU-powered isometric world prototype, built on Bevy + Rust + WASM. Wander, watch shadows snap, see what's possible at native frame rate.",
		tags: ['Isometric', 'Bevy', 'WebGPU'],
		status: 'beta',
		gradient: 'linear-gradient(135deg, #0e7490 0%, #312e81 100%)',
		icon: '◈',
	},
	{
		slug: 'ruffle',
		navIcon: 'play',
		title: 'Ruffle Flash player',
		href: '/arcade/',
		description:
			'WASM-based Flash player so we can bring SWF-era games back to life inside the arcade. Tracking integration, save-state, and controller mapping before we open the catalog.',
		tags: ['Ruffle', 'WASM', 'Flash'],
		status: 'soon',
		gradient: 'linear-gradient(135deg, #b45309 0%, #4c1d95 100%)',
		icon: '▶',
	},
	{
		slug: 'more',
		navIcon: 'star',
		title: 'More first-party titles',
		href: '/arcade/',
		description:
			'KBVE Studio keeps shipping. New titles drop here first — track the project changelog for what’s cooking next.',
		tags: ['Roadmap', 'Studio'],
		status: 'soon',
		gradient: 'linear-gradient(135deg, #1e3a8a 0%, #0e7490 100%)',
		icon: '✜',
	},
];

export const ARCADE_PLAYABLE = ARCADE_GAMES.filter(
	(game) => game.status !== 'soon',
);

export const ARCADE_UPCOMING = ARCADE_GAMES.filter(
	(game) => game.status === 'soon',
);
