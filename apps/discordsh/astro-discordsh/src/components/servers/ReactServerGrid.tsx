import { useState, useEffect, useCallback } from 'react';
import { ReactServerCard } from './ReactServerCard';
import { fetchServers, CATEGORIES, castVote } from '@/lib/servers';
import type { ServerCard, SortOption } from '@/lib/servers';
import { useHCaptcha } from '@/lib/servers/useHCaptcha';

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
	const {
		containerRef: captchaRef,
		execute: executeCaptcha,
		reset: resetCaptcha,
	} = useHCaptcha();

	const handleVote = useCallback(
		async (serverId: string): Promise<boolean> => {
			try {
				const captchaToken = await executeCaptcha();
				const result = await castVote(serverId, captchaToken);
				if (result.success) {
					setServers((prev) =>
						prev.map((s) =>
							s.server_id === serverId
								? { ...s, vote_count: s.vote_count + 1 }
								: s,
						),
					);
					return true;
				}
				console.warn('Vote failed:', result.message);
				return false;
			} catch (err) {
				console.error('Vote error:', err);
				return false;
			} finally {
				resetCaptcha();
			}
		},
		[executeCaptcha, resetCaptcha],
	);

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
			{/* Invisible hCaptcha container */}
			<div ref={captchaRef} className="hidden" />

			{/* Category filter pills */}
			<div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
				<button
					onClick={() => setCategory(null)}
					className={`sg-pill ${!category ? 'sg-pill-active' : 'sg-pill-inactive'}`}>
					All
				</button>
				{CATEGORIES.map((cat) => (
					<button
						key={cat.id}
						onClick={() =>
							setCategory(category === cat.id ? null : cat.id)
						}
						className={`sg-pill ${category === cat.id ? 'sg-pill-active' : 'sg-pill-inactive'}`}>
						{cat.label}
					</button>
				))}
			</div>

			{/* Sort bar */}
			<div className="flex items-center justify-between mb-4">
				<span className="sg-muted text-sm">
					{total} server{total !== 1 ? 's' : ''}
				</span>
				<select
					value={sort}
					onChange={(e) => setSort(e.target.value as SortOption)}
					className="sg-select">
					{SORT_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			{/* Server grid */}
			<div className="grid gap-4 sg-grid-cols">
				{servers.map((server) => (
					<ReactServerCard
						key={server.server_id}
						server={server}
						onVote={handleVote}
					/>
				))}
			</div>

			{/* Empty state */}
			{!loading && servers.length === 0 && (
				<div className="text-center py-12 px-4 sg-muted">
					<p className="text-lg m-0">No servers found</p>
					<p className="text-sm mt-2">
						Try a different category or check back later.
					</p>
				</div>
			)}

			{/* Load more */}
			{hasMore && !loading && (
				<div className="flex justify-center mt-6">
					<button onClick={handleLoadMore} className="sg-load-more">
						Load More
					</button>
				</div>
			)}

			{/* Loading indicator */}
			{loading && servers.length > 0 && (
				<div className="flex justify-center p-6 sg-muted text-sm">
					Loading…
				</div>
			)}
		</div>
	);
}
