import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { ReactServerCard } from './ReactServerCard';
import { CATEGORIES, castVote } from '@/lib/servers';
import type { SortOption } from '@/lib/servers';
import {
	$servers,
	$total,
	$category,
	$sort,
	$hasMore,
	$loading,
	loadServers,
	setCategory,
	setSort,
	loadMore,
	applyVote,
} from '@/lib/servers/serverStore';
import { useHCaptcha } from '@/lib/servers/useHCaptcha';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
	{ value: 'votes', label: 'Top Voted' },
	{ value: 'members', label: 'Most Members' },
];

export function ReactServerGrid() {
	const servers = useStore($servers);
	const total = useStore($total);
	const category = useStore($category);
	const sort = useStore($sort);
	const loading = useStore($loading);

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
		[executeCaptcha, resetCaptcha],
	);

	const sentinelRef = useRef<HTMLDivElement>(null);

	// Initial load
	useEffect(() => {
		loadServers(true);
	}, []);

	// Infinite scroll — load next page when sentinel enters viewport
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (
					entries[0]?.isIntersecting &&
					$hasMore.get() &&
					!$loading.get()
				) {
					loadMore();
				}
			},
			{ rootMargin: '200px' },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

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
