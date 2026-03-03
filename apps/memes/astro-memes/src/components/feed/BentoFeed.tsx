import { useState, useCallback, useRef, useEffect } from 'react';
import BentoMemeCard from './BentoMemeCard';
import MemeLightbox from './MemeLightbox';
import type { FeedMeme } from '../../lib/memeService';

interface BentoFeedProps {
	memes: FeedMeme[];
	hasMore: boolean;
	loadingMore: boolean;
	userReactions: Map<string, number>;
	userSaves: Set<string>;
	onReact: (memeId: string, reaction: number) => void;
	onSave: (memeId: string) => void;
	onUnsave: (memeId: string) => void;
	onComment: (memeId: string) => void;
	onShare: (memeId: string) => void;
	onReport: (memeId: string) => void;
	onLoadMore: () => void;
}

export default function BentoFeed({
	memes,
	hasMore,
	loadingMore,
	userReactions,
	userSaves,
	onReact,
	onSave,
	onUnsave,
	onComment,
	onShare,
	onReport,
	onLoadMore,
}: BentoFeedProps) {
	const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Infinite scroll sentinel
	useEffect(() => {
		if (!sentinelRef.current || !hasMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
					onLoadMore();
				}
			},
			{ rootMargin: '400px' },
		);

		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [hasMore, loadingMore, onLoadMore]);

	const handleExpand = useCallback(
		(meme: FeedMeme) => {
			const idx = memes.findIndex((m) => m.id === meme.id);
			setExpandedIndex(idx >= 0 ? idx : null);
		},
		[memes],
	);

	const handlePrev = useCallback(() => {
		setExpandedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
	}, []);

	const handleNext = useCallback(() => {
		setExpandedIndex((i) =>
			i !== null && i < memes.length - 1 ? i + 1 : i,
		);
	}, [memes.length]);

	const expandedMeme = expandedIndex !== null ? memes[expandedIndex] : null;

	return (
		<>
			<div
				className="w-full min-h-screen px-4 py-6"
				style={{
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				{/* Bento grid */}
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-w-7xl mx-auto">
					{memes.map((meme, i) => (
						<BentoMemeCard
							key={meme.id}
							meme={meme}
							featured={i % 7 === 3}
							onExpand={handleExpand}
						/>
					))}
				</div>

				{/* Sentinel */}
				{hasMore && (
					<div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
				)}

				{/* Loading more */}
				{loadingMore && (
					<div className="flex justify-center py-8">
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-w-7xl mx-auto w-full">
							{[...Array(4)].map((_, i) => (
								<div
									key={i}
									className="aspect-[4/3] rounded-xl animate-pulse"
									style={{
										backgroundColor:
											'var(--sl-color-gray-6, #1c1c1e)',
									}}
								/>
							))}
						</div>
					</div>
				)}

				{/* End of feed */}
				{!hasMore && memes.length > 0 && (
					<div className="flex items-center justify-center py-12">
						<p
							className="text-sm"
							style={{
								color: 'var(--sl-color-gray-3, #71717a)',
							}}>
							You've seen them all — for now.
						</p>
					</div>
				)}
			</div>

			{/* Lightbox */}
			{expandedMeme && (
				<MemeLightbox
					meme={expandedMeme}
					userReaction={userReactions.get(expandedMeme.id) ?? null}
					isSaved={userSaves.has(expandedMeme.id)}
					onReact={onReact}
					onSave={onSave}
					onUnsave={onUnsave}
					onComment={onComment}
					onShare={onShare}
					onReport={onReport}
					onClose={() => setExpandedIndex(null)}
					onPrev={
						expandedIndex !== null && expandedIndex > 0
							? handlePrev
							: null
					}
					onNext={
						expandedIndex !== null &&
						expandedIndex < memes.length - 1
							? handleNext
							: null
					}
				/>
			)}
		</>
	);
}
