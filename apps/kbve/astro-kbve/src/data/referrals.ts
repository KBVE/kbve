export interface ReferralEntry {
	slug: string;
	target: string;
	title: string;
	blurb?: string;
}

export const referrals: ReferralEntry[] = [
	{
		slug: '@fudster',
		target: 'https://store.steampowered.com/app/2238370/RareIcon/',
		title: 'RareIcon on Steam',
		blurb: 'Bullet-hell roguelite — Chip vs DaemonCorps.',
	},
];
