import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTrail, config } from '@react-spring/web';
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
	const prevCount = useRef(0);

	// Track how many memes were already rendered for entrance animation
	const animateFrom = useMemo(() => {
		const from = prevCount.current;
		prevCount.current = memes.length;
		return from;
	}, [memes.length]);

	// Trail animation for staggered card entrance
	const trail = useTrail(memes.length, {
		from: { opacity: 0, y: 24 },
		to: { opacity: 1, y: 0 },
		config: { ...config.gentle, clamp: true },
	});

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
				className="w-full min-h-screen px-4 md:px-6 lg:px-8 py-8"
				style={{
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				{/* Bento grid */}
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-7xl mx-auto">
					{trail.map((springStyle, i) => {
						const meme = memes[i];
						const shouldAnimate = i >= animateFrom;
						return (
							<BentoMemeCard
								key={meme.id}
								meme={meme}
								featured={i % 7 === 3}
								onExpand={handleExpand}
								style={
									shouldAnimate
										? {
												opacity:
													springStyle.opacity.get(),
												transform: `translateY(${springStyle.y.get()}px)`,
											}
										: undefined
								}
							/>
						);
					})}
				</div>

				{/* Sentinel */}
				{hasMore && (
					<div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
				)}

				{/* Loading more — shimmer skeleton cards */}
				{loadingMore && (
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-7xl mx-auto mt-4">
						{[...Array(4)].map((_, i) => (
							<div
								key={i}
								className="aspect-[4/3] rounded-2xl overflow-hidden"
								style={{
									background:
										'linear-gradient(110deg, var(--sl-color-gray-6, #1c1c1e) 30%, var(--sl-color-gray-5, #27272a) 50%, var(--sl-color-gray-6, #1c1c1e) 70%)',
									backgroundSize: '200% 100%',
									animation:
										'shimmer 1.5s ease-in-out infinite',
									animationDelay: `${i * 100}ms`,
									border: '1px solid rgba(255,255,255,0.04)',
								}}
							/>
						))}
					</div>
				)}

				{/* End of feed */}
				{!hasMore && memes.length > 0 && (
					<div className="flex items-center justify-center py-16">
						<p
							className="text-sm tracking-wide"
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
