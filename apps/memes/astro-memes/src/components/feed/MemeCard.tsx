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
	lazy?: boolean;
}

const MemeCard = forwardRef<HTMLDivElement, MemeCardProps>(
	({ meme, userReaction, isSaved, onReact, onSave, onUnsave, lazy }, ref) => {
		const isVideo = meme.format === 3 || meme.format === 2;

		return (
			<div
				ref={ref}
				className="relative flex items-center justify-center"
				style={{
					height: '100dvh',
					scrollSnapAlign: 'start',
					scrollSnapStop: 'always',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				{/* Meme asset */}
				{isVideo ? (
					<video
						src={meme.asset_url}
						className="max-w-full max-h-full object-contain"
						autoPlay
						loop
						muted
						playsInline
					/>
				) : (
					<img
						src={meme.thumbnail_url || meme.asset_url}
						alt={meme.title || 'Meme'}
						className="max-w-full max-h-full object-contain select-none"
						loading={lazy ? 'lazy' : 'eager'}
						draggable={false}
					/>
				)}

				{/* Bottom gradient overlay */}
				<div
					className="absolute bottom-0 left-0 right-0 pointer-events-none"
					style={{
						height: '40%',
						background:
							'linear-gradient(transparent, rgba(0,0,0,0.75))',
					}}
				/>

				{/* Title + Author */}
				<div className="absolute bottom-0 left-0 right-16 p-4 pb-6">
					{meme.title && (
						<h2 className="text-white text-base font-semibold leading-tight mb-2 drop-shadow-md line-clamp-2">
							{meme.title}
						</h2>
					)}

					<div className="flex items-center gap-2">
						{meme.author_avatar ? (
							<img
								src={meme.author_avatar}
								alt={meme.author_name || ''}
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
						{meme.author_name && (
							<span className="text-white/80 text-sm font-medium">
								@{meme.author_name}
							</span>
						)}
					</div>

					{/* Tags */}
					{meme.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mt-2">
							{meme.tags.slice(0, 3).map((tag) => (
								<span
									key={tag}
									className="text-[11px] px-2 py-0.5 rounded-full"
									style={{
										backgroundColor: 'rgba(255,255,255,0.1)',
										color: 'rgba(255,255,255,0.6)',
									}}>
									#{tag}
								</span>
							))}
						</div>
					)}
				</div>

				{/* Reaction bar — right side */}
				<div className="absolute right-3 bottom-24">
					<ReactionBar
						memeId={meme.id}
						reactionCount={meme.reaction_count}
						saveCount={meme.save_count}
						userReaction={userReaction}
						isSaved={isSaved}
						onReact={onReact}
						onSave={onSave}
						onUnsave={onUnsave}
					/>
				</div>
			</div>
		);
	},
);

MemeCard.displayName = 'MemeCard';
export default MemeCard;
