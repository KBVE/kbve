import { useEffect, useCallback, useState } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import { X, ChevronLeft, ChevronRight, ExternalLink, User } from 'lucide-react';
import ReactionBar from './ReactionBar';
import type { FeedMeme } from '../../lib/memeService';

interface MemeLightboxProps {
	meme: FeedMeme;
	userReaction: number | null;
	isSaved: boolean;
	onReact: (memeId: string, reaction: number) => void;
	onSave: (memeId: string) => void;
	onUnsave: (memeId: string) => void;
	onComment: (memeId: string) => void;
	onShare: (memeId: string) => void;
	onReport: (memeId: string) => void;
	onClose: () => void;
	onPrev: (() => void) | null;
	onNext: (() => void) | null;
}

export default function MemeLightbox({
	meme,
	userReaction,
	isSaved,
	onReact,
	onSave,
	onUnsave,
	onComment,
	onShare,
	onReport,
	onClose,
	onPrev,
	onNext,
}: MemeLightboxProps) {
	const isVideo = meme.format === 2 || meme.format === 3;
	const [closing, setClosing] = useState(false);

	// Backdrop fade
	const backdropSpring = useSpring({
		opacity: closing ? 0 : 1,
		config: { duration: 200 },
	});

	// Content scale + fade
	const contentSpring = useSpring({
		opacity: closing ? 0 : 1,
		scale: closing ? 0.95 : 1,
		config: config.stiff,
	});

	// Animate meme transitions (prev/next navigation)
	const memeSpring = useSpring({
		opacity: 1,
		from: { opacity: 0.6 },
		reset: true,
		config: { tension: 300, friction: 28 },
		key: meme.id,
	});

	const handleClose = useCallback(() => {
		setClosing(true);
		setTimeout(onClose, 180);
	}, [onClose]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose();
			else if (e.key === 'ArrowLeft' && onPrev) onPrev();
			else if (e.key === 'ArrowRight' && onNext) onNext();
		},
		[handleClose, onPrev, onNext],
	);

	useEffect(() => {
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [handleKeyDown]);

	return (
		<animated.div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ opacity: backdropSpring.opacity }}
			role="dialog"
			aria-modal="true"
			aria-label={meme.title || 'Meme viewer'}>
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/75 backdrop-blur-md"
				onClick={handleClose}
			/>

			{/* Close button */}
			<button
				type="button"
				onClick={handleClose}
				className="absolute top-4 right-4 z-10 p-2.5 rounded-full backdrop-blur-md transition-colors hover:bg-white/15"
				style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
				aria-label="Close">
				<X size={18} className="text-white" />
			</button>

			{/* Open in new tab */}
			<a
				href={`/meme?id=${meme.id}`}
				target="_blank"
				rel="noopener noreferrer"
				className="absolute top-4 right-16 z-10 p-2.5 rounded-full backdrop-blur-md transition-colors hover:bg-white/15"
				style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
				title="Open in new tab"
				aria-label="Open meme in new tab">
				<ExternalLink size={16} className="text-white/80" />
			</a>

			{/* Prev arrow */}
			{onPrev && (
				<button
					type="button"
					onClick={onPrev}
					className="absolute left-4 z-10 p-2.5 rounded-full backdrop-blur-md transition-colors hover:bg-white/15"
					style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
					aria-label="Previous meme">
					<ChevronLeft size={22} className="text-white" />
				</button>
			)}

			{/* Next arrow */}
			{onNext && (
				<button
					type="button"
					onClick={onNext}
					className="absolute right-4 z-10 p-2.5 rounded-full backdrop-blur-md transition-colors hover:bg-white/15"
					style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
					aria-label="Next meme">
					<ChevronRight size={22} className="text-white" />
				</button>
			)}

			{/* Content area */}
			<animated.div
				className="relative flex items-start gap-4 max-w-5xl w-full mx-4 max-h-[90vh]"
				style={{
					opacity: contentSpring.opacity,
					transform: contentSpring.scale.to((s) => `scale(${s})`),
				}}>
				{/* Main image + info */}
				<animated.div
					className="flex-1 min-w-0 flex flex-col items-center"
					style={{ opacity: memeSpring.opacity }}>
					{/* Meme asset */}
					<div className="max-h-[75vh] flex items-center justify-center w-full">
						{isVideo ? (
							<video
								src={meme.asset_url}
								className="max-w-full max-h-[75vh] object-contain rounded-2xl"
								style={{
									border: '1px solid rgba(255,255,255,0.08)',
									boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
								}}
								autoPlay
								loop
								muted
								playsInline
							/>
						) : (
							<img
								src={meme.asset_url}
								alt={meme.title || 'Meme'}
								className="max-w-full max-h-[75vh] object-contain rounded-2xl select-none"
								style={{
									border: '1px solid rgba(255,255,255,0.08)',
									boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
								}}
								draggable={false}
							/>
						)}
					</div>

					{/* Info below image */}
					<div className="w-full mt-4 px-2">
						{meme.title && (
							<h2
								className="text-base font-semibold leading-tight mb-2.5 line-clamp-2"
								style={{
									color: 'var(--sl-color-white, #e2e8f0)',
								}}>
								{meme.title}
							</h2>
						)}

						<div className="flex items-center gap-2.5">
							{meme.author_name ? (
								<a
									href={`https://kbve.com/@${meme.author_name}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 group">
									{meme.author_avatar ? (
										<img
											src={meme.author_avatar}
											alt={meme.author_name}
											className="w-7 h-7 rounded-full"
											style={{
												boxShadow:
													'0 0 0 2px rgba(255,255,255,0.1)',
											}}
										/>
									) : (
										<div
											className="w-7 h-7 rounded-full flex items-center justify-center"
											style={{
												backgroundColor:
													'var(--sl-color-accent-low, #164e63)',
											}}>
											<User
												size={14}
												style={{
													color: 'var(--sl-color-text-accent, #22d3ee)',
												}}
											/>
										</div>
									)}
									<span
										className="text-sm font-medium group-hover:underline"
										style={{
											color: 'var(--sl-color-gray-2, #a1a1aa)',
										}}>
										@{meme.author_name}
									</span>
								</a>
							) : (
								<div
									className="w-7 h-7 rounded-full flex items-center justify-center"
									style={{
										backgroundColor:
											'var(--sl-color-accent-low, #164e63)',
									}}>
									<User
										size={14}
										style={{
											color: 'var(--sl-color-text-accent, #22d3ee)',
										}}
									/>
								</div>
							)}
						</div>

						{meme.tags.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mt-2.5">
								{meme.tags.slice(0, 5).map((tag) => (
									<span
										key={tag}
										className="text-[11px] px-2.5 py-0.5 rounded-full text-white/50"
										style={{
											backgroundColor:
												'rgba(255,255,255,0.08)',
										}}>
										#{tag}
									</span>
								))}
							</div>
						)}
					</div>
				</animated.div>

				{/* Reaction bar — right side */}
				<div className="flex-shrink-0 pt-4">
					<ReactionBar
						memeId={meme.id}
						reactionCount={meme.reaction_count}
						saveCount={meme.save_count}
						commentCount={meme.comment_count}
						shareCount={meme.share_count}
						userReaction={userReaction}
						isSaved={isSaved}
						onReact={onReact}
						onSave={onSave}
						onUnsave={onUnsave}
						onComment={onComment}
						onShare={onShare}
						onReport={onReport}
					/>
				</div>
			</animated.div>
		</animated.div>
	);
}
