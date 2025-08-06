/** @jsxImportSource react */
import React, {
	useEffect,
	useRef,
	useState,
	useCallback,
	memo,
} from 'react';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Twitch } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => twMerge(clsx(inputs));

type LogEntry = {
	id: string;
	message: string;
};

const fetchLogs = async (page: number): Promise<LogEntry[]> => {
	const res = await fetch(`/api/logs?page=${page}`);
	return res.json();
};

export default function ReactFooter() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const loaderRef = useRef<HTMLDivElement | null>(null);

	const loadMore = useCallback(async () => {
		const newLogs = await fetchLogs(page);
		if (newLogs.length === 0) {
			setHasMore(false);
		} else {
			setLogs((prev) => [...prev, ...newLogs]);
			setPage((prev) => prev + 1);
		}
	}, [page]);

	useEffect(() => {
		loadMore();
	}, []);

	useEffect(() => {
		if (!loaderRef.current || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					loadMore();
				}
			},
			{
				root: null,
				rootMargin: '0px',
				threshold: 1.0,
			}
		);

		observer.observe(loaderRef.current);
		return () => observer.disconnect();
	}, [loadMore, hasMore]);

	const Row = memo(({ index, style }: ListChildComponentProps) => (
		<div
			style={style}
			className="p-2 bg-[#2b2740] rounded border border-purple-500/10 shadow hover:border-purple-500 transition m-1 text-gray-300 text-sm"
		>
			{logs[index]?.message || 'Loading...'}
		</div>
	));

	return (
		<div className="w-full bg-[#312d4b] border-t border-purple-500/20 shadow-inner">
			<div className="max-w-7xl mx-auto px-4 py-6">
				<h3 className="text-sm text-purple-400 mb-2 flex items-center gap-2">
					<Twitch className="w-4 h-4" /> Live Activity Feed
				</h3>

				<div className="relative h-64 rounded border border-purple-500/10 bg-gray-900">
					<AutoSizer>
						{({ height, width }) => (
							<List
								height={height}
								width={width}
								itemCount={logs.length}
								itemSize={60}
								className="p-2"
							>
								{Row}
							</List>
						)}
					</AutoSizer>
					{/* Observer trigger */}
					<div ref={loaderRef} className="h-4" />
				</div>

				<div className="pt-2 text-center text-xs text-purple-400">
					{hasMore ? 'Loading more...' : 'End of feed'}
				</div>
			</div>
		</div>
	);
}
