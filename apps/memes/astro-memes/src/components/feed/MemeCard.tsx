import { forwardRef } from 'react';
import { User } from 'lucide-react';
import ReactionBar from './ReactionBar';
import type { FeedMeme } from '../../lib/memeService';

interface MemeCardProps {
	meme: FeedMeme;
	userReaction: number | null;
	isSaved: boolean;
	onReact: (memeId: string, reaction: number) => void;
	onSave: (memeId: string) => void;
	onUnsave: (memeId: string) => void;
	onComment: (memeId: string) => void;
	onShare: (memeId: string) => void;
	onReport: (memeId: string) => void;
	lazy?: boolean;
}

const MemeCard = forwardRef<HTMLDivElement, MemeCardProps>(
	(
		{
			meme,
			userReaction,
			isSaved,
			onReact,
			onSave,
			onUnsave,
			onComment,
			onShare,
			onReport,
			lazy,
		},
		ref,
	) => {
		const isVideo = meme.format === 3 || meme.format === 2;

		return (
			<div
				ref={ref}
				data-meme-id={meme.id}
				className="relative flex items-center justify-center"
				style={{
					height: '100dvh',
					scrollSnapAlign: 'start',
					scrollSnapStop: 'always',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				{/* Meme asset — constrained with rounded corners */}
				<div className="relative flex items-center justify-center w-full px-4"
					style={{ maxHeight: '82dvh' }}>
					{isVideo ? (
						<video
							src={meme.asset_url}
							className="max-w-full max-h-full object-contain rounded-xl"
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
							src={meme.thumbnail_url || meme.asset_url}
							alt={meme.title || 'Meme'}
							className="max-w-full max-h-full object-contain select-none rounded-xl"
							style={{
								border: '1px solid rgba(255,255,255,0.06)',
							}}
							loading={lazy ? 'lazy' : 'eager'}
							draggable={false}
						/>
					)}
				</div>

				{/* Bottom info card — frosted glass */}
				<div
					className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 pointer-events-none"
					style={{
						background: 'linear-gradient(transparent, rgba(0,0,0,0.7) 40%)',
					}}>
					<div className="pointer-events-auto max-w-lg">
						{meme.title && (
							<h2 className="text-white text-base font-semibold leading-tight mb-2 drop-shadow-md line-clamp-2">
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
											className="w-8 h-8 rounded-full transition-shadow group-hover:shadow-[0_0_0_2px_var(--sl-color-accent,#0ea5e9)]"
										/>
									) : (
										<div
											className="w-8 h-8 rounded-full flex items-center justify-center"
											style={{
												backgroundColor:
													'var(--sl-color-accent-low, #164e63)',
											}}>
											<User
												size={15}
												style={{
													color: 'var(--sl-color-text-accent, #22d3ee)',
												}}
											/>
										</div>
									)}
									<span className="text-white/80 text-sm font-medium group-hover:text-white transition-colors">
										@{meme.author_name}
									</span>
								</a>
							) : (
								<div
									className="w-8 h-8 rounded-full flex items-center justify-center"
									style={{
										backgroundColor:
											'var(--sl-color-accent-low, #164e63)',
									}}>
									<User
										size={15}
										style={{
											color: 'var(--sl-color-text-accent, #22d3ee)',
										}}
									/>
								</div>
							)}
						</div>

						{/* Tags */}
						{meme.tags.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mt-2.5">
								{meme.tags.slice(0, 3).map((tag) => (
									<span
										key={tag}
										className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 text-white/60 backdrop-blur-sm">
										#{tag}
									</span>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Reaction bar — right side with glass pill */}
				<div className="absolute right-3 bottom-28">
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
		);
	},
);

MemeCard.displayName = 'MemeCard';
export default MemeCard;
