import { CtaSection, type HeroAction } from '@kbve/rn-astro';

interface Props {
	title: string;
	subtitle?: string;
	actions?: HeroAction[];
}

export default function CtaIsland(props: Props) {
	return (
		<CtaSection
			{...props}
			onNavigate={(href) => window.location.assign(href)}
		/>
	);
}
