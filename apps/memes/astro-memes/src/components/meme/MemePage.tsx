import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import { ArrowLeft, User } from 'lucide-react';
import ReactionBar from '../feed/ReactionBar';
import {
	fetchMemeById,
	reactToMeme,
	removeReaction,
	saveMeme,
	unsaveMeme,
	getUserReactions,
	getUserSaves,
	trackView,
	trackShare,
} from '../../lib/memeService';
import type { FeedMeme } from '../../lib/memeService';

const SIGNIN_MODAL = 'signin';

export default function MemePage() {
	const auth = useStore($auth);

	const [meme, setMeme] = useState<FeedMeme | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [userReaction, setUserReaction] = useState<number | null>(null);
	const [isSaved, setIsSaved] = useState(false);
	// Extract meme ID from query params
	const memeId =
		typeof window !== 'undefined'
			? new URLSearchParams(window.location.search).get('id')
			: null;

	// Fetch meme
	useEffect(() => {
		if (!memeId) {
			setError(true);
			setLoading(false);
			return;
		}

		let cancelled = false;

		(async () => {
			try {
				const data = await fetchMemeById(memeId);
				if (cancelled) return;
				if (data) {
					setMeme(data);
					document.title = `${data.title || 'Meme'} — Meme.sh`;
					trackView(memeId).catch(() => {});
				} else {
					setError(true);
				}
			} catch {
				if (!cancelled) setError(true);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [memeId]);

	// Fetch user reaction / save state
	useEffect(() => {
		if (auth.tone !== 'auth' || !meme) return;

		Promise.all([getUserReactions([meme.id]), getUserSaves([meme.id])])
			.then(([reactions, saves]) => {
				setUserReaction(reactions.get(meme.id) ?? null);
				setIsSaved(saves.has(meme.id));
			})
			.catch(() => {});
	}, [auth.tone, meme?.id]);

	// Handlers
	const handleReact = useCallback(
		(id: string, reaction: number) => {
			const prev = userReaction;
			const toggling = prev === reaction;

			setUserReaction(toggling ? null : reaction);
			setMeme((m) =>
				m
					? {
							...m,
							reaction_count:
								m.reaction_count +
								(toggling ? -1 : prev === null ? 1 : 0),
						}
					: m,
			);

			const promise = toggling
				? removeReaction(id)
				: reactToMeme(id, reaction);
			promise.catch(() => {
				setUserReaction(prev);
				setMeme((m) =>
					m
						? {
								...m,
								reaction_count:
									m.reaction_count +
									(toggling ? 1 : prev === null ? -1 : 0),
							}
						: m,
				);
			});
		},
		[userReaction],
	);

	const handleSave = useCallback((id: string) => {
		setIsSaved(true);
		setMeme((m) => (m ? { ...m, save_count: m.save_count + 1 } : m));

		saveMeme(id).catch(() => {
			setIsSaved(false);
			setMeme((m) => (m ? { ...m, save_count: m.save_count - 1 } : m));
		});
	}, []);

	const handleUnsave = useCallback((id: string) => {
		setIsSaved(false);
		setMeme((m) => (m ? { ...m, save_count: m.save_count - 1 } : m));

		unsaveMeme(id).catch(() => {
			setIsSaved(true);
			setMeme((m) => (m ? { ...m, save_count: m.save_count + 1 } : m));
		});
	}, []);

	const handleShare = useCallback(async (id: string) => {
		const url = window.location.href;

		setMeme((m) => (m ? { ...m, share_count: m.share_count + 1 } : m));

		try {
			if (navigator.share) {
				await navigator.share({
					title: 'Check out this meme on Meme.sh',
					url,
				});
			} else {
				await navigator.clipboard.writeText(url);
				addToast({
					id: `share-copy-${Date.now()}`,
					message: 'Link copied!',
					severity: 'success',
					duration: 3000,
				});
			}
		} catch {
			setMeme((m) => (m ? { ...m, share_count: m.share_count - 1 } : m));
			return;
		}

		trackShare(id).catch(() => {});
	}, []);

	const handleComment = useCallback((_id: string) => {
		// Comments drawer not yet integrated on standalone meme page
	}, []);

	const handleReport = useCallback(
		(_id: string) => {
			if (auth.tone !== 'auth') {
				openModal(SIGNIN_MODAL);
				return;
			}
			addToast({
				id: `report-${Date.now()}`,
				message: 'Report feature coming soon.',
				severity: 'info',
				duration: 3000,
			});
		},
		[auth.tone],
	);

	// Loading state
	if (loading) {
		return (
			<div
				className="flex items-center justify-center"
				style={{
					minHeight: '100dvh',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				<div
					className="w-16 h-16 rounded-xl animate-pulse"
					style={{
						backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
					}}
				/>
			</div>
		);
	}

	// Error / not found
	if (error || !meme) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4"
				style={{
					minHeight: '100dvh',
					backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
				}}>
				<p
					className="text-lg font-medium"
					style={{
						color: 'var(--sl-color-white, #e2e8f0)',
					}}>
					Meme not found
				</p>
				<a
					href="/feed"
					className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors hover:opacity-80"
					style={{
						backgroundColor: 'var(--sl-color-accent-low, #164e63)',
						color: 'var(--sl-color-text-accent, #22d3ee)',
					}}>
					<ArrowLeft size={16} />
					Back to feed
				</a>
			</div>
		);
	}

	const isVideo = meme.format === 2 || meme.format === 3;

	return (
		<div
			className="flex flex-col items-center px-4 py-8"
			style={{
				minHeight: '100dvh',
				backgroundColor: 'var(--sl-color-bg, #0a0a0a)',
			}}>
			{/* Back link */}
			<div className="w-full max-w-3xl mb-6">
				<a
					href="/feed"
					className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
					style={{
						color: 'var(--sl-color-gray-2, #a1a1aa)',
					}}>
					<ArrowLeft size={16} />
					Back to feed
				</a>
			</div>

			{/* Content */}
			<div className="flex flex-col md:flex-row items-start gap-6 max-w-3xl w-full">
				{/* Meme asset */}
				<div className="flex-1 min-w-0 flex flex-col items-center w-full">
					<div className="w-full flex items-center justify-center">
						{isVideo ? (
							<video
								src={meme.asset_url}
								className="max-w-full max-h-[70vh] object-contain rounded-xl"
								style={{
									border: '1px solid var(--sl-color-hairline, rgba(255,255,255,0.06))',
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
								className="max-w-full max-h-[70vh] object-contain rounded-xl select-none"
								style={{
									border: '1px solid var(--sl-color-hairline, rgba(255,255,255,0.06))',
								}}
								draggable={false}
							/>
						)}
					</div>

					{/* Info */}
					<div className="w-full mt-4">
						{meme.title && (
							<h1
								className="text-xl font-bold leading-tight mb-3"
								style={{
									color: 'var(--sl-color-white, #e2e8f0)',
								}}>
								{meme.title}
							</h1>
						)}

						<div className="flex items-center gap-2.5 mb-3">
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
											className="w-8 h-8 rounded-full"
										/>
									) : (
										<div
											className="w-8 h-8 rounded-full flex items-center justify-center"
											style={{
												backgroundColor:
													'var(--sl-color-accent-low, #164e63)',
											}}>
											<User
												size={16}
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
									className="w-8 h-8 rounded-full flex items-center justify-center"
									style={{
										backgroundColor:
											'var(--sl-color-accent-low, #164e63)',
									}}>
									<User
										size={16}
										style={{
											color: 'var(--sl-color-text-accent, #22d3ee)',
										}}
									/>
								</div>
							)}
						</div>

						{meme.tags.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{meme.tags.map((tag) => (
									<span
										key={tag}
										className="text-xs px-2.5 py-1 rounded-full"
										style={{
											backgroundColor:
												'var(--sl-color-gray-6, #1c1c1e)',
											color: 'var(--sl-color-gray-2, #a1a1aa)',
											border: '1px solid var(--sl-color-hairline, rgba(255,255,255,0.06))',
										}}>
										#{tag}
									</span>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Reaction bar */}
				<div className="flex-shrink-0 md:sticky md:top-8">
					<ReactionBar
						memeId={meme.id}
						reactionCount={meme.reaction_count}
						saveCount={meme.save_count}
						commentCount={meme.comment_count}
						shareCount={meme.share_count}
						userReaction={userReaction}
						isSaved={isSaved}
						onReact={handleReact}
						onSave={handleSave}
						onUnsave={handleUnsave}
						onComment={handleComment}
						onShare={handleShare}
						onReport={handleReport}
					/>
				</div>
			</div>
		</div>
	);
}
