import { useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal, addToast } from '@kbve/astro';
import { User, Trash2, ChevronDown } from 'lucide-react';
import {
	fetchReplies,
	createComment,
	type FeedComment,
} from '../../lib/memeService';

interface CommentItemProps {
	comment: FeedComment;
	memeId: string;
	currentUserId: string | null;
	onDelete: (commentId: string) => void;
	depth?: number;
}

export default function CommentItem({
	comment,
	memeId,
	currentUserId,
	onDelete,
	depth = 0,
}: CommentItemProps) {
	const auth = useStore($auth);
	const isAuthor = currentUserId === comment.author_id;

	const [showReplies, setShowReplies] = useState(false);
	const [replies, setReplies] = useState<FeedComment[]>([]);
	const [replyCursor, setReplyCursor] = useState<string | null>(null);
	const [hasMoreReplies, setHasMoreReplies] = useState(true);
	const [loadingReplies, setLoadingReplies] = useState(false);

	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState('');
	const [submittingReply, setSubmittingReply] = useState(false);

	const loadReplies = useCallback(async () => {
		if (loadingReplies) return;
		setLoadingReplies(true);
		try {
			const page = await fetchReplies(comment.id, {
				limit: 10,
				cursor: replyCursor,
			});
			setReplies((prev) => [...prev, ...page.replies]);
			setReplyCursor(page.nextCursor);
			setHasMoreReplies(page.hasMore);
		} catch {
			addToast({
				id: `reply-err-${Date.now()}`,
				message: 'Failed to load replies.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setLoadingReplies(false);
		}
	}, [comment.id, replyCursor, loadingReplies]);

	const toggleReplies = useCallback(() => {
		if (!showReplies && replies.length === 0) loadReplies();
		setShowReplies((v) => !v);
	}, [showReplies, replies.length, loadReplies]);

	const handleReplySubmit = useCallback(async () => {
		if (!replyText.trim() || submittingReply) return;
		if (auth.tone !== 'auth') {
			openModal('signin');
			return;
		}

		setSubmittingReply(true);
		const body = replyText.trim();
		setReplyText('');

		try {
			const replyId = await createComment(memeId, body, comment.id);
			const optimistic: FeedComment = {
				id: replyId,
				author_id: auth.id,
				body,
				parent_id: comment.id,
				reaction_count: 0,
				reply_count: 0,
				created_at: new Date().toISOString(),
				author_name: auth.name || null,
				author_avatar: auth.avatar || null,
			};
			setReplies((prev) => [...prev, optimistic]);
			if (!showReplies) setShowReplies(true);
		} catch {
			setReplyText(body);
			addToast({
				id: `reply-post-err-${Date.now()}`,
				message: 'Failed to post reply.',
				severity: 'error',
				duration: 4000,
			});
		} finally {
			setSubmittingReply(false);
		}
	}, [replyText, submittingReply, auth, memeId, comment.id, showReplies]);

	const timeAgo = formatTimeAgo(comment.created_at);

	return (
		<div className="py-2.5" style={depth > 0 ? { paddingLeft: 32 } : undefined}>
			<div className="flex gap-2.5">
				{/* Avatar */}
				{comment.author_avatar ? (
					<img
						src={comment.author_avatar}
						alt=""
						className="w-7 h-7 rounded-full flex-shrink-0"
					/>
				) : (
					<div
						className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
						style={{
							backgroundColor: 'var(--sl-color-accent-low, #164e63)',
						}}>
						<User
							size={14}
							style={{ color: 'var(--sl-color-text-accent, #22d3ee)' }}
						/>
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<span
							className="text-xs font-semibold"
							style={{ color: 'var(--sl-color-white, #e2e8f0)' }}>
							{comment.author_name || 'Anonymous'}
						</span>
						<span
							className="text-[10px]"
							style={{ color: 'var(--sl-color-gray-3, #71717a)' }}>
							{timeAgo}
						</span>
					</div>

					<p
						className="text-sm mt-0.5 break-words"
						style={{ color: 'var(--sl-color-gray-2, #a1a1aa)' }}>
						{comment.body}
					</p>

					<div className="flex items-center gap-3 mt-1">
						{depth === 0 && (
							<button
								type="button"
								onClick={() => setShowReplyInput((v) => !v)}
								className="text-[11px] font-medium"
								style={{
									color: 'var(--sl-color-text-accent, #22d3ee)',
								}}>
								Reply
							</button>
						)}
						{comment.reply_count > 0 && depth === 0 && (
							<button
								type="button"
								onClick={toggleReplies}
								className="text-[11px] font-medium flex items-center gap-0.5"
								style={{
									color: 'var(--sl-color-text-accent, #22d3ee)',
								}}>
								<ChevronDown
									size={12}
									className={
										showReplies
											? 'rotate-180 transition-transform'
											: 'transition-transform'
									}
								/>
								{comment.reply_count}{' '}
								{comment.reply_count === 1 ? 'reply' : 'replies'}
							</button>
						)}
						{isAuthor && (
							<button
								type="button"
								onClick={() => onDelete(comment.id)}
								className="text-[11px] font-medium flex items-center gap-0.5"
								style={{ color: '#ef4444' }}>
								<Trash2 size={12} />
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Reply input */}
			{showReplyInput && depth === 0 && (
				<div className="flex items-end gap-2 mt-2 ml-9">
					<input
						value={replyText}
						onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleReplySubmit();
						}}
						placeholder="Write a reply..."
						disabled={submittingReply}
						className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
						style={{
							backgroundColor: 'var(--sl-color-gray-6, #1c1c1e)',
							color: 'var(--sl-color-white, #e2e8f0)',
							border: '1px solid var(--sl-color-hairline, #27272a)',
						}}
					/>
				</div>
			)}

			{/* Nested replies */}
			{showReplies &&
				replies.map((r) => (
					<CommentItem
						key={r.id}
						comment={r}
						memeId={memeId}
						currentUserId={currentUserId}
						onDelete={onDelete}
						depth={1}
					/>
				))}
			{showReplies && hasMoreReplies && (
				<button
					type="button"
					onClick={loadReplies}
					disabled={loadingReplies}
					className="text-[11px] ml-9 mt-1"
					style={{ color: 'var(--sl-color-text-accent, #22d3ee)' }}>
					{loadingReplies ? 'Loading...' : 'Load more replies'}
				</button>
			)}
		</div>
	);
}

function formatTimeAgo(iso: string): string {
	const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d`;
	const months = Math.floor(days / 30);
	return `${months}mo`;
}
