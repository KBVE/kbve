import { useState, useEffect, useCallback } from 'react';
import { ReactServerCard } from './ReactServerCard';
import { fetchServers, CATEGORIES } from '@/lib/servers';
import type { ServerCard, SortOption } from '@/lib/servers';

const slVar = (name: string, fallback: string) =>
	`var(--sl-color-${name}, ${fallback})`;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
	{ value: 'votes', label: 'Top Voted' },
	{ value: 'members', label: 'Most Members' },
];

const PAGE_SIZE = 24;

export function ReactServerGrid() {
	const [servers, setServers] = useState<ServerCard[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [category, setCategory] = useState<string | null>(null);
	const [sort, setSort] = useState<SortOption>('votes');
	const [loading, setLoading] = useState(true);

	const loadServers = useCallback(
		async (reset = false) => {
			setLoading(true);
			const p = reset ? 1 : page;
			const result = await fetchServers({
				category: category ?? undefined,
				sort,
				page: p,
				limit: PAGE_SIZE,
			});
			setServers((prev) =>
				reset ? result.servers : [...prev, ...result.servers],
			);
			setTotal(result.total);
			if (reset) setPage(1);
			setLoading(false);
		},
		[category, sort, page],
	);

	// Reset on category/sort change
	useEffect(() => {
		setPage(1);
		setServers([]);
		loadServers(true);
	}, [category, sort]);

	const handleLoadMore = () => {
		const nextPage = page + 1;
		setPage(nextPage);
	};

	// Load more when page increments beyond 1
	useEffect(() => {
		if (page > 1) loadServers(false);
	}, [page]);

	const hasMore = servers.length < total;

	return (
		<div>
			{/* Category filter pills */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					overflowX: 'auto',
					paddingBottom: '0.5rem',
					marginBottom: '1rem',
				}}>
				<button
					onClick={() => setCategory(null)}
					style={{
						padding: '0.375rem 0.875rem',
						borderRadius: '9999px',
						border: `1px solid ${!category ? slVar('accent', '#8b5cf6') : slVar('gray-5', '#374151')}`,
						backgroundColor: !category
							? slVar('accent-low', '#1e1033')
							: 'transparent',
						color: !category
							? slVar('accent', '#8b5cf6')
							: slVar('gray-3', '#9ca3af'),
						fontSize: '0.8125rem',
						fontWeight: 500,
						cursor: 'pointer',
						whiteSpace: 'nowrap',
						transition: 'all 0.15s',
					}}>
					All
				</button>
				{CATEGORIES.map((cat) => (
					<button
						key={cat.id}
						onClick={() =>
							setCategory(category === cat.id ? null : cat.id)
						}
						style={{
							padding: '0.375rem 0.875rem',
							borderRadius: '9999px',
							border: `1px solid ${category === cat.id ? slVar('accent', '#8b5cf6') : slVar('gray-5', '#374151')}`,
							backgroundColor:
								category === cat.id
									? slVar('accent-low', '#1e1033')
									: 'transparent',
							color:
								category === cat.id
									? slVar('accent', '#8b5cf6')
									: slVar('gray-3', '#9ca3af'),
							fontSize: '0.8125rem',
							fontWeight: 500,
							cursor: 'pointer',
							whiteSpace: 'nowrap',
							transition: 'all 0.15s',
						}}>
						{cat.label}
					</button>
				))}
			</div>

			{/* Sort bar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '1rem',
				}}>
				<span
					style={{
						fontSize: '0.875rem',
						color: slVar('gray-3', '#9ca3af'),
					}}>
					{total} server{total !== 1 ? 's' : ''}
				</span>
				<select
					value={sort}
					onChange={(e) => setSort(e.target.value as SortOption)}
					style={{
						padding: '0.375rem 0.75rem',
						borderRadius: '0.5rem',
						border: `1px solid ${slVar('gray-5', '#374151')}`,
						backgroundColor: slVar('gray-7', '#1f2937'),
						color: slVar('text', '#e5e7eb'),
						fontSize: '0.8125rem',
						cursor: 'pointer',
					}}>
					{SORT_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			{/* Server grid */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(min(100%, 22rem), 1fr))',
					gap: '1rem',
				}}>
				{servers.map((server) => (
					<ReactServerCard key={server.server_id} server={server} />
				))}
			</div>

			{/* Empty state */}
			{!loading && servers.length === 0 && (
				<div
					style={{
						textAlign: 'center',
						padding: '3rem 1rem',
						color: slVar('gray-3', '#9ca3af'),
					}}>
					<p style={{ fontSize: '1.125rem', margin: 0 }}>
						No servers found
					</p>
					<p
						style={{
							fontSize: '0.875rem',
							marginTop: '0.5rem',
						}}>
						Try a different category or check back later.
					</p>
				</div>
			)}

			{/* Load more */}
			{hasMore && !loading && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						marginTop: '1.5rem',
					}}>
					<button
						onClick={handleLoadMore}
						style={{
							padding: '0.625rem 1.5rem',
							borderRadius: '0.5rem',
							border: `1px solid ${slVar('gray-5', '#374151')}`,
							backgroundColor: 'transparent',
							color: slVar('text', '#e5e7eb'),
							fontSize: '0.875rem',
							fontWeight: 500,
							cursor: 'pointer',
							transition: 'all 0.15s',
						}}>
						Load More
					</button>
				</div>
			)}

			{/* Loading indicator */}
			{loading && servers.length > 0 && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						padding: '1.5rem',
						color: slVar('gray-3', '#9ca3af'),
						fontSize: '0.875rem',
					}}>
					Loading…
				</div>
			)}
		</div>
	);
}
