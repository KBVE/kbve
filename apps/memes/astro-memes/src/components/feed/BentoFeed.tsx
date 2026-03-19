import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTrail } from '@react-spring/web';
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

	// Trail animation — smooth ease-out-quart, no spring overshoot
	const trail = useTrail(memes.length, {
		from: { opacity: 0, y: 20 },
		to: { opacity: 1, y: 0 },
		config: { tension: 170, friction: 26, clamp: true },
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
				className="w-full min-h-screen px-3 md:px-6 lg:px-8 py-6 md:py-10"
				style={{ backgroundColor: '#0c0c0e' }}>
				{/* Bento grid — masonry-like columns with auto-fit */}
				<div
					className="max-w-7xl mx-auto"
					style={{
						columns: 'auto',
						columnCount: 'auto',
						columnWidth: '280px',
						columnGap: '12px',
					}}>
					{trail.map((springStyle, i) => {
						const meme = memes[i];
						const shouldAnimate = i >= animateFrom;
						// First card is hero; then every 8th for rhythm
						const isFeatured = i === 0 || (i > 0 && i % 8 === 0);
						return (
							<div
								key={meme.id}
								style={{
									breakInside: 'avoid',
									marginBottom: '12px',
								}}>
								<BentoMemeCard
									meme={meme}
									featured={isFeatured}
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
							</div>
						);
					})}
				</div>

				{/* Sentinel */}
				{hasMore && (
					<div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
				)}

				{/* Loading more — skeleton cards */}
				{loadingMore && (
					<div
						className="max-w-7xl mx-auto mt-3"
						style={{
							columns: 'auto',
							columnCount: 'auto',
							columnWidth: '280px',
							columnGap: '12px',
						}}>
						{[...Array(4)].map((_, i) => (
							<div
								key={i}
								style={{
									breakInside: 'avoid',
									marginBottom: '12px',
								}}>
								<div
									className="rounded-xl overflow-hidden"
									style={{
										aspectRatio:
											i % 2 === 0 ? '4 / 3' : '3 / 4',
										background:
											'linear-gradient(110deg, #161618 30%, #1e1e21 50%, #161618 70%)',
										backgroundSize: '200% 100%',
										animation:
											'shimmer 1.5s ease-in-out infinite',
										animationDelay: `${i * 100}ms`,
									}}
								/>
							</div>
						))}
					</div>
				)}

				{/* End of feed */}
				{!hasMore && memes.length > 0 && (
					<div className="flex items-center justify-center py-20">
						<p
							className="text-[13px] tracking-widest uppercase"
							style={{ color: '#3a3a3f' }}>
							End of feed
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
