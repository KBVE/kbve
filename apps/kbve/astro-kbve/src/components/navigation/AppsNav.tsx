import { appsNav } from './dashboardMenu';
import NavMenu from './NavMenu';

export default function AppsNav() {
	return (
		<NavMenu
			menuLabel="Applications and projects menu"
			title="Apps"
			pillLabel="Apps"
			nodes={appsNav}
			icon={
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true">
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<line x1="3" y1="9" x2="21" y2="9" />
					<line x1="7" y1="6.5" x2="7.01" y2="6.5" />
					<line x1="10" y1="6.5" x2="10.01" y2="6.5" />
				</svg>
			}
		/>
	);
}
