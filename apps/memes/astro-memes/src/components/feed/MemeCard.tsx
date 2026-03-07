import { forwardRef, useState } from 'react';
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
		const [imgLoaded, setImgLoaded] = useState(false);

		// Pre-calculate aspect ratio for stable sizing before image loads
		const aspectRatio =
			meme.width && meme.height ? meme.width / meme.height : 1;

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
				<div
					className="relative flex items-center justify-center w-full px-4"
					style={{ maxHeight: '82dvh' }}>
					{/* Stable-size container using known aspect ratio */}
					<div
						className="relative rounded-xl overflow-hidden"
						style={{
							width: '100%',
							maxWidth: `min(calc(82dvh * ${aspectRatio}), 100%)`,
							aspectRatio: `${aspectRatio}`,
							maxHeight: '82dvh',
							border: '1px solid rgba(255,255,255,0.06)',
							backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
						}}>
						{isVideo ? (
							<video
								src={meme.asset_url}
								className="absolute inset-0 w-full h-full object-cover"
								autoPlay
								loop
								muted
								playsInline
							/>
						) : (
							<img
								src={meme.thumbnail_url || meme.asset_url}
								alt={meme.title || 'Meme'}
								className="absolute inset-0 w-full h-full object-cover select-none"
								loading={lazy ? 'lazy' : 'eager'}
								draggable={false}
								onLoad={() => setImgLoaded(true)}
								style={{
									opacity: imgLoaded ? 1 : 0,
									transition: 'opacity 0.3s ease',
								}}
							/>
						)}

						{/* Shimmer overlay for image loading */}
						{!isVideo && (
							<div
								className="absolute inset-0 pointer-events-none"
								style={{
									opacity: imgLoaded ? 0 : 1,
									transition: 'opacity 0.4s ease',
									background:
										'linear-gradient(110deg, var(--sl-color-gray-6, #1c1c1e) 30%, var(--sl-color-gray-5, #27272a) 50%, var(--sl-color-gray-6, #1c1c1e) 70%)',
									backgroundSize: '200% 100%',
									animation:
										'shimmer 1.5s ease-in-out infinite',
								}}
							/>
						)}
					</div>
				</div>

				{/* Bottom info card — frosted glass */}
				<div
					className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 pointer-events-none"
					style={{
						background:
							'linear-gradient(transparent, rgba(0,0,0,0.7) 40%)',
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

				<style>{`
					@keyframes shimmer {
						0% { background-position: 200% 0; }
						100% { background-position: -200% 0; }
					}
				`}</style>
			</div>
		);
	},
);

MemeCard.displayName = 'MemeCard';
export default MemeCard;
