export type ItchPlatform = 'web' | 'windows' | 'linux' | 'mac' | 'android';

export interface ItchGame {
	id: number;
	slug: string;
	title: string;
	desc?: string;
	genre?: string;
	platforms: ItchPlatform[];
	thumb?: string;
	thumbColor?: string;
	featured?: boolean;
}

export const ITCH_PROFILE_URL = 'https://kbve.itch.io';
export const ITCH_DEVLOG_RSS = 'https://kbve.itch.io/devlog.rss';

export const KBVE_ITCH_GAMES: ItchGame[] = [
	{
		id: 2285869,
		slug: 'rareicon',
		title: 'RareIcon',
		desc: '2D sci-fi Action-RPG bullet-hell roguelite. Chip vs DaemonCorps.',
		genre: 'Action-RPG',
		platforms: ['linux', 'mac', 'android'],
		thumbColor: '#000000',
		featured: true,
	},
	{
		id: 4245453,
		slug: 'slick',
		title: 'SLICK',
		platforms: ['web'],
	},
	{
		id: 4147439,
		slug: 'rentearth',
		title: 'RentEarth',
		platforms: ['windows', 'linux', 'mac'],
	},
	{
		id: 4030676,
		slug: 'bugwars',
		title: 'Bug Wars',
		platforms: ['web'],
	},
	{
		id: 3994260,
		slug: 'cityvote',
		title: 'CityVote',
		platforms: ['web'],
	},
	{
		id: 3973386,
		slug: 'afk',
		title: 'AFK Cat Lord',
		desc: 'From Whiskers to Throne, lead the Haus of Kats.',
		platforms: ['web'],
		thumb: 'https://img.itch.zone/aW1nLzIzODAyODk2LnBuZw==/315x250%23c/wsx7Wp.png',
		thumbColor: '#8ec48d',
	},
	{
		id: 3737646,
		slug: 'airship',
		title: 'Airship',
		genre: 'Adventure',
		platforms: ['web'],
		thumbColor: '#1E3A8A',
	},
	{
		id: 3340442,
		slug: 'asteroids-driods',
		title: 'Asteroids & Droids',
		desc: 'All about dat h e a t.',
		genre: 'Shooter',
		platforms: ['web'],
		thumb: 'https://img.itch.zone/aW1nLzE5OTc0Mjk1LnBuZw==/315x250%23c/lr0HA2.png',
		thumbColor: '#193d3f',
	},
	{
		id: 2590929,
		slug: 'travelbox',
		title: 'TravelBox',
		genre: 'Action',
		platforms: ['web'],
		thumb: 'https://img.itch.zone/aW1nLzE1NDMyODQyLnBuZw==/315x250%23c/x%2BsivB.png',
		thumbColor: '#141414',
	},
	{
		id: 2561506,
		slug: 'fishchip',
		title: 'Fish & Chip',
		desc: 'Chip loves to fish.',
		genre: 'Educational',
		platforms: ['web'],
		thumb: 'https://img.itch.zone/aW1nLzE1MjU3MzgwLnBuZw==/315x250%23c/fczRHT.png',
		thumbColor: '#eeeeee',
	},
	{
		id: 2345082,
		slug: 'dev-saber',
		title: 'Saber: Red Scale Dragon',
		desc: 'Developer pipeline build of SABER.',
		genre: 'Adventure',
		platforms: ['web', 'windows'],
	},
];

export const ITCH_PLATFORM_META: Record<
	ItchPlatform,
	{ label: string; icon: string }
> = {
	web: { label: 'Play in browser', icon: '▶' },
	windows: { label: 'Windows', icon: '⊞' },
	linux: { label: 'Linux', icon: '🐧' },
	mac: { label: 'macOS', icon: '' },
	android: { label: 'Android', icon: '▲' },
};
