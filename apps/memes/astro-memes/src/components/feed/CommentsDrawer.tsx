import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import { X, Send } from 'lucide-react';
import CommentItem from './CommentItem';
import {
	fetchComments,
	createComment,
	deleteComment,
	type FeedComment,
} from '../../lib/memeService';

interface CommentsDrawerProps {
	memeId: string;
	commentCount: number;
	onClose: () => void;
	onCommentCountChange: (memeId: string, delta: number) => void;
}

export default function CommentsDrawer({
	memeId,
	commentCount,
	onClose,
	onCommentCountChange,
}: CommentsDrawerProps) {
	const auth = useStore($auth);

	const [comments, setComments] = useState<FeedComment[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const [loading, setLoading] = useState(true);

	const [newText, setNewText] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const [visible, setVisible] = useState(false);

	const listRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Animate in + lock body scroll
	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		requestAnimationFrame(() =>
			requestAnimationFrame(() => setVisible(true)),
		);
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	// Fetch initial comments
	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const page = await fetchComments(memeId, { limit: 20 });
				if (cancelled) return;
				setComments(page.comments);
				setCursor(page.nextCursor);
				setHasMore(page.hasMore);
			} catch {
				if (!cancelled) {
					addToast({
						id: `cmt-load-err-${Date.now()}`,
						message: 'Failed to load comments.',
						severity: 'error',
						duration: 4000,
					});
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [memeId]);

	// Infinite scroll for more comments
	useEffect(() => {
		if (!sentinelRef.current || !hasMore || loading) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore) loadMore();
			},
			{ root: listRef.current, rootMargin: '100px' },
		);

		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [hasMore, cursor, loading]);

	const loadMore = useCallback(async () => {
		if (!hasMore) return;
		try {
			const page = await fetchComments(memeId, {
				limit: 20,
				cursor,
			});
			setComments((prev) => [...prev, ...page.comments]);
			setCursor(page.nextCursor);
			setHasMore(page.hasMore);
		} catch {
			addToast({
				id: `cmt-more-err-${Date.now()}`,
				message: 'Failed to load more comments.',
				severity: 'error',
				duration: 4000,
			});
		}
	}, [memeId, hasMore, cursor]);

	// Close with animation
	const handleClose = useCallback(() => {
		setVisible(false);
		setTimeout(onClose, 300);
	}, [onClose]);

	// Submit new comment
	const handleSubmit = useCallback(async () => {
		if (!newText.trim() || submitting) return;
		if (auth.tone !== 'auth') {
			openModal('signin');
			return;
		}

		setSubmitting(true);
		const body = newText.trim();
		setNewText('');

		try {
			const commentId = await createComment(memeId, body);
			const optimistic: FeedComment = {
				id: commentId,
				author_id: auth.id,
				body,
				parent_id: null,
				reaction_count: 0,
				reply_count: 0,
				created_at: new Date().toISOString(),
				author_name: auth.name || null,
				author_avatar: auth.avatar || null,
			};
			setComments((prev) => [optimistic, ...prev]);
			onCommentCountChange(memeId, 1);
		} catch {
			setNewText(body);
			addToast({
				id: `cmt-post-err-${Date.now()}`,
				message: 'Failed to post comment.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setSubmitting(false);
		}
	}, [newText, submitting, auth, memeId, onCommentCountChange]);

	// Delete handler
	const handleDelete = useCallback(
		(commentId: string) => {
			setComments((prev) => prev.filter((c) => c.id !== commentId));
			onCommentCountChange(memeId, -1);
			deleteComment(commentId).catch(() => {
				addToast({
					id: `cmt-del-err-${Date.now()}`,
					message: 'Failed to delete comment.',
					severity: 'error',
					duration: 4000,
				});
			});
		},
		[memeId, onCommentCountChange],
	);

	return createPortal(
		<div
			className={`fixed inset-0 z-50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
			role="dialog"
			aria-modal="true"
			aria-label="Comments">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50"
				onClick={handleClose}
			/>

			{/* Bottom sheet */}
			<div
				className={`absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
				style={{
					height: '70dvh',
					backgroundColor: 'var(--sl-color-bg-nav, #18181b)',
					color: 'var(--sl-color-white, #e2e8f0)',
				}}>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3 flex-shrink-0"
					style={{
						borderBottom:
							'1px solid var(--sl-color-hairline, #27272a)',
					}}>
					<h3 className="text-sm font-semibold">
						{commentCount}{' '}
						{commentCount === 1 ? 'Comment' : 'Comments'}
					</h3>
					<button
						type="button"
						onClick={handleClose}
						aria-label="Close comments"
						className="w-8 h-8 flex items-center justify-center rounded-md"
						style={{ color: 'var(--sl-color-gray-3, #71717a)' }}>
						<X size={16} />
					</button>
				</div>

				{/* Scrollable comment list */}
				<div
					ref={listRef}
					className="flex-1 overflow-y-auto px-4 py-2">
					{loading ? (
						<div className="flex flex-col gap-4 py-4">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="flex gap-2.5 animate-pulse">
									<div
										className="w-7 h-7 rounded-full flex-shrink-0"
										style={{
											backgroundColor:
												'var(--sl-color-gray-5, #3f3f46)',
										}}
									/>
									<div className="flex-1 space-y-2">
										<div
											className="h-3 w-24 rounded"
											style={{
												backgroundColor:
													'var(--sl-color-gray-5, #3f3f46)',
											}}
										/>
										<div
											className="h-3 w-full rounded"
											style={{
												backgroundColor:
													'var(--sl-color-gray-5, #3f3f46)',
											}}
										/>
									</div>
								</div>
							))}
						</div>
					) : comments.length === 0 ? (
						<p
							className="text-center text-sm py-8"
							style={{
								color: 'var(--sl-color-gray-3, #71717a)',
							}}>
							No comments yet. Be the first!
						</p>
					) : (
						<>
							{comments.map((c) => (
								<CommentItem
									key={c.id}
									comment={c}
									memeId={memeId}
									currentUserId={
										auth.tone === 'auth'
											? auth.id
											: null
									}
									onDelete={handleDelete}
								/>
							))}
							{hasMore && (
								<div
									ref={sentinelRef}
									style={{ height: 1 }}
									aria-hidden
								/>
							)}
						</>
					)}
				</div>

				{/* Input area */}
				<div
					className="px-4 py-3 flex-shrink-0"
					style={{
						borderTop:
							'1px solid var(--sl-color-hairline, #27272a)',
					}}>
					{auth.tone === 'auth' ? (
						<div className="flex items-end gap-2">
							<textarea
								value={newText}
								onChange={(e) =>
									setNewText(e.target.value.slice(0, 500))
								}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										handleSubmit();
									}
								}}
								placeholder="Add a comment..."
								rows={1}
								disabled={submitting}
								className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
								style={{
									backgroundColor:
										'var(--sl-color-gray-6, #1c1c1e)',
									color: 'var(--sl-color-white, #e2e8f0)',
									border: '1px solid var(--sl-color-hairline, #27272a)',
								}}
							/>
							<button
								type="button"
								onClick={handleSubmit}
								disabled={!newText.trim() || submitting}
								className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
								style={{
									backgroundColor:
										'var(--sl-color-accent, #0ea5e9)',
									color: '#fff',
								}}>
								<Send size={16} />
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => openModal('signin')}
							className="w-full text-center text-sm py-2 rounded-lg transition-colors"
							style={{
								backgroundColor:
									'var(--sl-color-accent-low, #164e63)',
								color: 'var(--sl-color-text-accent, #22d3ee)',
							}}>
							Sign in to comment
						</button>
					)}
				</div>
			</div>
		</div>,
		document.body,
	);
}
