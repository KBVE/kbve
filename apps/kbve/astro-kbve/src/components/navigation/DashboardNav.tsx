import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { $isStaff } from '@kbve/droid';
import { dashboardNav, filterNav } from './dashboardMenu';
import NavMenu from './NavMenu';

export default function DashboardNav() {
	const isStaff = useStore($isStaff);
	const nodes = useMemo(() => filterNav(dashboardNav, isStaff), [isStaff]);

	return (
		<NavMenu
			menuLabel="Dashboard menu"
			title="Dashboard"
			pillLabel="Dashboard"
			nodes={nodes}
			icon={
				<>
					<svg
						className="dnav__glyph dnav__glyph--grid"
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true">
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
					<svg
						className="dnav__glyph dnav__glyph--burger"
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true">
						<line x1="3" y1="6" x2="21" y2="6" />
						<line x1="3" y1="12" x2="21" y2="12" />
						<line x1="3" y1="18" x2="21" y2="18" />
					</svg>
				</>
			}
		/>
	);
}
