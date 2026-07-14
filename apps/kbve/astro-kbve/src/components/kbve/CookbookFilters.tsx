import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$facetLanguage,
	$facetCategory,
	$facetStatus,
	$facetSearch,
	setFacet,
	setSearch,
} from './projectFilterStore';
import { cn } from '@/lib/utils';

export interface FacetValue {
	value: string;
	label: string;
	count: number;
}

export interface FacetGroup {
	key: 'language' | 'category' | 'status';
	label: string;
	values: FacetValue[];
}

interface Props {
	groups: FacetGroup[];
}

export default function CookbookFilters({ groups }: Props) {
	const language = useStore($facetLanguage);
	const category = useStore($facetCategory);
	const status = useStore($facetStatus);
	const search = useStore($facetSearch);

	const active = { language, category, status };
	const [open, setOpen] = useState(false);

	const activeCount =
		(language !== 'all' ? 1 : 0) +
		(category !== 'all' ? 1 : 0) +
		(status !== 'all' ? 1 : 0) +
		(search.trim() ? 1 : 0);

	useEffect(() => {
		const cells = document.querySelectorAll<HTMLElement>(
			'[data-filter-cell="project"]',
		);
		const q = search.trim().toLowerCase();
		cells.forEach((cell) => {
			const match = (facet: string, val: string) => {
				if (val === 'all') return true;
				const keys = (cell.dataset[facet] || '')
					.split(/\s+/)
					.filter(Boolean);
				return keys.includes(val);
			};
			const name = cell.dataset.name || '';
			const show =
				match('language', language) &&
				match('category', category) &&
				match('status', status) &&
				(!q || name.includes(q));
			cell.hidden = !show;
		});
	}, [language, category, status, search]);

	return (
		<div className="facet-panel">
			<div className="facet-search">
				<input
					type="search"
					className="facet-search__input"
					placeholder="Search projects"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search projects"
				/>
			</div>
			<button
				type="button"
				className="facet-toggle"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}>
				<span>Filters{activeCount ? ` (${activeCount})` : ''}</span>
				<svg
					className={cn(
						'facet-toggle__chevron',
						open && 'facet-toggle__chevron--open',
					)}
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>
			<div
				className={cn('facet-groups', open && 'facet-groups--open')}>
			{groups.map((group) => {
				const labelId = `facet-${group.key}-label`;
				return (
					<div key={group.key} className="facet-group">
						<div id={labelId} className="facet-group__label">
							{group.label}
						</div>
						<div
							className="facet-group__list"
							role="radiogroup"
							aria-labelledby={labelId}>
							<button
								type="button"
								role="radio"
								aria-checked={active[group.key] === 'all'}
								className={cn(
									'facet-row',
									active[group.key] === 'all' &&
										'facet-row--active',
								)}
								onClick={() => setFacet(group.key, 'all')}>
								<span className="facet-row__label">All</span>
							</button>
							{group.values.map((v) => (
								<button
									key={v.value}
									type="button"
									role="radio"
									aria-checked={active[group.key] === v.value}
									aria-label={`${v.label}, ${v.count} project${v.count === 1 ? '' : 's'}`}
									className={cn(
										'facet-row',
										active[group.key] === v.value &&
											'facet-row--active',
									)}
									onClick={() =>
										setFacet(group.key, v.value)
									}>
									<span className="facet-row__label">
										{v.label}
									</span>
									<span className="facet-row__count">
										{v.count}
									</span>
								</button>
							))}
						</div>
					</div>
				);
			})}
			</div>
		</div>
	);
}
