import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	$activeCategory,
	$activeRegistry,
	setCategory,
	setRegistry,
} from './projectFilterStore';
import { cn } from '@/lib/utils';

export interface FilterTab {
	key: string;
	label: string;
	count: number;
}

interface Props {
	group: 'category' | 'registry';
	tabs: FilterTab[];
}

export default function ProjectFilterTabs({ group, tabs }: Props) {
	const store = group === 'category' ? $activeCategory : $activeRegistry;
	const setActive = group === 'category' ? setCategory : setRegistry;
	const active = useStore(store);

	useEffect(() => {
		const cells = document.querySelectorAll<HTMLElement>(
			`[data-filter-group="${group}"]`,
		);
		cells.forEach((cell) => {
			const keys = (cell.dataset.filterKeys || '')
				.split(/\s+/)
				.filter(Boolean);
			const show = active === 'all' || keys.includes(active);
			cell.hidden = !show;
		});
	}, [active, group]);

	return (
		<div
			className="project-tabs"
			role="tablist"
			aria-label={`Filter by ${group}`}>
			{tabs.map((tab) => (
				<button
					key={tab.key}
					type="button"
					role="tab"
					aria-selected={active === tab.key}
					className={cn(
						'project-tab',
						active === tab.key && 'project-tab--active',
					)}
					onClick={() => setActive(tab.key)}>
					<span className="project-tab__label">{tab.label}</span>
					<span className="project-tab__count">{tab.count}</span>
				</button>
			))}
		</div>
	);
}
