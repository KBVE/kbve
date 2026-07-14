import { Hero, type HeroProps } from '@kbve/rn-astro';

export default function HeroIsland(props: Omit<HeroProps, 'onNavigate'>) {
	return (
		<Hero {...props} onNavigate={(href) => window.location.assign(href)} />
	);
}
