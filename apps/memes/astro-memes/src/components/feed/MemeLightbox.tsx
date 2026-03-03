import { useEffect, useCallback } from 'react';
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

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			else if (e.key === 'ArrowLeft' && onPrev) onPrev();
			else if (e.key === 'ArrowRight' && onNext) onNext();
		},
		[onClose, onPrev, onNext],
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
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			role="dialog"
			aria-modal="true"
			aria-label={meme.title || 'Meme viewer'}>
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/70 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Close button */}
			<button
				type="button"
				onClick={onClose}
				className="absolute top-4 right-4 z-10 p-2 rounded-full backdrop-blur-md transition-colors hover:bg-white/10"
				style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
				aria-label="Close">
				<X size={20} className="text-white" />
			</button>

			{/* Open in new tab */}
			<a
				href={`/meme?id=${meme.id}`}
				target="_blank"
				rel="noopener noreferrer"
				className="absolute top-4 right-16 z-10 p-2 rounded-full backdrop-blur-md transition-colors hover:bg-white/10"
				style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
				title="Open in new tab"
				aria-label="Open meme in new tab">
				<ExternalLink size={18} className="text-white/80" />
			</a>

			{/* Prev arrow */}
			{onPrev && (
				<button
					type="button"
					onClick={onPrev}
					className="absolute left-4 z-10 p-2 rounded-full backdrop-blur-md transition-colors hover:bg-white/10"
					style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
					aria-label="Previous meme">
					<ChevronLeft size={24} className="text-white" />
				</button>
			)}

			{/* Next arrow */}
			{onNext && (
				<button
					type="button"
					onClick={onNext}
					className="absolute right-4 z-10 p-2 rounded-full backdrop-blur-md transition-colors hover:bg-white/10"
					style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
					aria-label="Next meme">
					<ChevronRight size={24} className="text-white" />
				</button>
			)}

			{/* Content area */}
			<div className="relative flex items-start gap-4 max-w-5xl w-full mx-4 max-h-[90vh]">
				{/* Main image + info */}
				<div className="flex-1 min-w-0 flex flex-col items-center">
					{/* Meme asset */}
					<div className="max-h-[75vh] flex items-center justify-center w-full">
						{isVideo ? (
							<video
								src={meme.asset_url}
								className="max-w-full max-h-[75vh] object-contain rounded-xl"
								style={{
									border: '1px solid rgba(255,255,255,0.06)',
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
								className="max-w-full max-h-[75vh] object-contain rounded-xl select-none"
								style={{
									border: '1px solid rgba(255,255,255,0.06)',
								}}
								draggable={false}
							/>
						)}
					</div>

					{/* Info below image */}
					<div className="w-full mt-3 px-2">
						{meme.title && (
							<h2
								className="text-base font-semibold leading-tight mb-2 line-clamp-2"
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
							<div className="flex flex-wrap gap-1.5 mt-2">
								{meme.tags.slice(0, 5).map((tag) => (
									<span
										key={tag}
										className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
										#{tag}
									</span>
								))}
							</div>
						)}
					</div>
				</div>

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
			</div>
		</div>
	);
}
