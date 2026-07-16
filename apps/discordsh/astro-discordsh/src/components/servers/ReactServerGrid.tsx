import { useEffect, useCallback, useRef, useState } from 'react';
import {
	QueryClientProvider,
	useInfiniteQuery,
	useQueryClient,
} from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { ReactServerCard } from './ReactServerCard';
import { CATEGORIES, castVote, fetchServers } from '@/lib/servers';
import type { ServerCard, SortOption } from '@/lib/servers';
import { queryClient } from '@/lib/servers/queryClient';
import { useHCaptcha } from '@/lib/servers/useHCaptcha';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
	{ value: 'votes', label: 'Top Voted' },
	{ value: 'members', label: 'Most Members' },
];

const PAGE_SIZE = 24;

type ServersPage = { servers: ServerCard[]; total: number };

function serversKey(category: string | null, sort: SortOption) {
	return ['servers', category, sort] as const;
}

function GridInner() {
	const [category, setCategory] = useState<string | null>(null);
	const [sort, setSort] = useState<SortOption>('votes');
	const qc = useQueryClient();

	const query = useInfiniteQuery({
		queryKey: serversKey(category, sort),
		queryFn: ({ pageParam }) =>
			fetchServers({
				category: category ?? undefined,
				sort,
				page: pageParam,
				limit: PAGE_SIZE,
			}),
		initialPageParam: 1,
		getNextPageParam: (last: ServersPage, pages: ServersPage[]) => {
			const loaded = pages.reduce((n, p) => n + p.servers.length, 0);
			return loaded < last.total ? pages.length + 1 : undefined;
		},
	});

	const servers = query.data?.pages.flatMap((p) => p.servers) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;
	const loading = query.isLoading || query.isFetchingNextPage;

	const {
		containerRef: captchaRef,
		execute: executeCaptcha,
		reset: resetCaptcha,
	} = useHCaptcha();

	const applyVote = useCallback(
		(serverId: string) => {
			qc.setQueryData<InfiniteData<ServersPage>>(
				serversKey(category, sort),
				(data) =>
					data && {
						...data,
						pages: data.pages.map((p) => ({
							...p,
							servers: p.servers.map((s) =>
								s.server_id === serverId
									? { ...s, vote_count: s.vote_count + 1 }
									: s,
							),
						})),
					},
			);
		},
		[qc, category, sort],
	);

	const handleVote = useCallback(
		async (serverId: string): Promise<boolean> => {
			try {
				const captchaToken = await executeCaptcha();
				const result = await castVote(serverId, captchaToken);
				if (result.success) {
					applyVote(serverId);
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
		[executeCaptcha, resetCaptcha, applyVote],
	);

	const sentinelRef = useRef<HTMLDivElement>(null);

	// Infinite scroll — load next page when sentinel enters viewport
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0]?.isIntersecting &&
					query.hasNextPage &&
					!query.isFetchingNextPage
				) {
					query.fetchNextPage();
				}
			},
			{ rootMargin: '200px' },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

	return (
		<div>
			{/* Invisible hCaptcha container */}
			<div ref={captchaRef} className="hidden" />

			{/* Category filter pills — wrap into rows, no horizontal scroll */}
			<div className="flex flex-wrap items-center gap-2 mb-4">
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

			{/* Infinite scroll sentinel */}
			<div ref={sentinelRef} className="h-1" />

			{/* Loading indicator */}
			{loading && servers.length > 0 && (
				<div className="flex justify-center p-6 sg-muted text-sm">
					Loading…
				</div>
			)}
		</div>
	);
}

export function ReactServerGrid() {
	return (
		<QueryClientProvider client={queryClient}>
			<GridInner />
		</QueryClientProvider>
	);
}
