import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { REACTIONS } from '../../lib/memeService';

const SIGNIN_MODAL = 'signin';

interface ReactionBarProps {
	memeId: string;
	reactionCount: number;
	saveCount: number;
	userReaction: number | null;
	isSaved: boolean;
	onReact: (memeId: string, reaction: number) => void;
	onSave: (memeId: string) => void;
	onUnsave: (memeId: string) => void;
}

export default function ReactionBar({
	memeId,
	reactionCount,
	saveCount,
	userReaction,
	isSaved,
	onReact,
	onSave,
	onUnsave,
}: ReactionBarProps) {
	const auth = useStore($auth);

	const handleReact = useCallback(
		(reaction: number) => {
			if (auth.tone !== 'auth') {
				openModal(SIGNIN_MODAL);
				return;
			}
			onReact(memeId, reaction);
		},
		[auth.tone, memeId, onReact],
	);

	const handleSave = useCallback(() => {
		if (auth.tone !== 'auth') {
			openModal(SIGNIN_MODAL);
			return;
		}
		if (isSaved) {
			onUnsave(memeId);
		} else {
			onSave(memeId);
		}
	}, [auth.tone, memeId, isSaved, onSave, onUnsave]);

	// Show a subset of reactions to keep the bar compact
	const visibleReactions = REACTIONS.filter((r) =>
		[3, 4, 5, 1].includes(r.key),
	);

	return (
		<div className="flex flex-col items-center gap-3">
			{visibleReactions.map((r) => {
				const isActive = userReaction === r.key;
				return (
					<button
						key={r.key}
						type="button"
						onClick={() => handleReact(r.key)}
						className="flex flex-col items-center gap-0.5 transition-transform duration-150 active:scale-110"
						aria-label={r.label}
						title={r.label}>
						<span
							className="text-2xl leading-none select-none"
							style={{
								filter: isActive ? 'none' : 'grayscale(0.5)',
								opacity: isActive ? 1 : 0.7,
							}}>
							{r.emoji}
						</span>
						{isActive && (
							<span
								className="text-[10px] font-bold"
								style={{
									color: 'var(--sl-color-text-accent, #22d3ee)',
								}}>
								{r.label}
							</span>
						)}
					</button>
				);
			})}

			{/* Total reaction count */}
			<span className="text-xs font-medium text-white/60">
				{formatCount(reactionCount)}
			</span>

			{/* Divider */}
			<div className="w-6 h-px bg-white/10" />

			{/* Save / Bookmark */}
			<button
				type="button"
				onClick={handleSave}
				className="flex flex-col items-center gap-0.5 transition-transform duration-150 active:scale-110"
				aria-label={isSaved ? 'Unsave' : 'Save'}
				title={isSaved ? 'Unsave' : 'Save'}>
				{isSaved ? (
					<BookmarkCheck
						size={24}
						style={{
							color: 'var(--sl-color-text-accent, #22d3ee)',
						}}
					/>
				) : (
					<Bookmark size={24} className="text-white/70" />
				)}
				<span className="text-[10px] text-white/60">
					{formatCount(saveCount)}
				</span>
			</button>
		</div>
	);
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
