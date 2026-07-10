import { ProjectGrid, type ProjectItem } from '@kbve/rn-astro';

interface Props {
	title?: string;
	subtitle?: string;
	projects: ProjectItem[];
}

export default function ProjectGridIsland(props: Props) {
	return (
		<ProjectGrid
			{...props}
			onNavigate={(href) => window.location.assign(href)}
		/>
	);
}
