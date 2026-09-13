import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal } from '@kbve/astro';
import {
	Inbox,
	Send,
	RefreshCw,
	Reply,
	LogIn,
	Paperclip,
	ArrowLeft,
	AlertCircle,
	CheckCircle2,
	MessagesSquare,
} from 'lucide-react';
import { initSupa } from '../../lib/supa';
import {
	ApiError,
	describeSendError,
	getMailbox,
	getThread,
	listThreads,
	sendMail,
	threadCursorOf,
	type Cursor,
	type ThreadDetail,
	type ThreadMessage,
	type ThreadRow,
} from '../../lib/api';
import { MessageBody } from './MessageBody';

const PAGE = 50;

type Filter = 'all' | 'in' | 'out';

function fmtDate(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const now = new Date();
	const sameDay = d.toDateString() === now.toDateString();
	return sameDay
		? d.toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit',
			})
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/// The mailbox owner is in almost every thread; showing their own address back
/// to them in the list carries no information.
function others(participants: string[], self: string | null): string {
	const rest = participants.filter(
		(p) => !self || p.toLowerCase() !== self.toLowerCase(),
	);
	const list = rest.length > 0 ? rest : participants;
	return list.join(', ') || '(unknown)';
}

/// Quote what is being answered, the way every mail client does, so the reply
/// still reads as a reply once it leaves this thread and lands in a client that
/// knows nothing about it.
function quoted(msg: ThreadMessage | null): string {
	if (!msg) return '';
	const body = (msg.body.text ?? '').trim();
	if (!body) return '';
	const when = new Date(msg.sent_at ?? msg.received_at).toLocaleString();
	const lines = body.split('\n').slice(0, 200);
	return `\n\nOn ${when}, ${msg.from_addr} wrote:\n${lines
		.map((l) => `> ${l}`)
		.join('\n')}\n`;
}

/// Replies must answer an inbound message: the send policy rejects anything
/// that is not a reply, and only an inbound message carries a parent to cite.
function lastInbound(thread: ThreadDetail | null): ThreadMessage | null {
	if (!thread) return null;
	for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
		if (thread.messages[i].direction === 'in') return thread.messages[i];
	}
	return null;
}

function replySubject(subject: string | null): string {
	const s = (subject ?? '').trim();
	if (!s) return 'Re:';
	return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export default function ReactInbox() {
	const auth = useStore($auth);
	const [rows, setRows] = useState<ThreadRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [exhausted, setExhausted] = useState(false);
	const [filter, setFilter] = useState<Filter>('all');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detail, setDetail] = useState<ThreadDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [self, setSelf] = useState<string | null>(null);
	const [composing, setComposing] = useState(false);
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const [sendResult, setSendResult] = useState<
		{ ok: true; text: string } | { ok: false; text: string } | null
	>(null);

	useEffect(() => {
		initSupa().catch(() => {});
	}, []);

	useEffect(() => {
		if (auth.tone !== 'auth') return;
		let cancelled = false;
		getMailbox()
			.then((m) => {
				if (!cancelled) setSelf(m.address);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [auth.tone]);

	const load = useCallback(
		async (cursor?: Cursor | null, dir: Filter = filter) => {
			setLoading(true);
			setLoadError(null);
			try {
				const { threads } = await listThreads({
					limit: PAGE,
					cursor,
					direction: dir === 'all' ? null : dir,
				});
				setRows((prev) => (cursor ? [...prev, ...threads] : threads));
				setExhausted(threads.length < PAGE);
			} catch (err) {
				setLoadError(
					err instanceof ApiError && err.status === 401
						? 'Your session ended. Sign in again.'
						: 'Could not load your mailbox.',
				);
			} finally {
				setLoading(false);
			}
		},
		[filter],
	);

	useEffect(() => {
		if (auth.tone === 'auth') void load(null, filter);
		if (auth.tone === 'anon') {
			setRows([]);
			setDetail(null);
			setSelectedId(null);
		}
	}, [auth.tone, filter, load]);

	useEffect(() => {
		if (!selectedId) {
			setDetail(null);
			return;
		}
		let cancelled = false;
		setDetailLoading(true);
		setComposing(false);
		setSendResult(null);
		getThread(selectedId)
			.then((t) => {
				if (!cancelled) setDetail(t);
			})
			.catch(() => {
				if (!cancelled) setDetail(null);
			})
			.finally(() => {
				if (!cancelled) setDetailLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedId]);

	const visible = rows;

	// Keyboard navigation. Skipped whenever focus is in a field, so typing a
	// reply never moves the selection out from under the draft.
	useEffect(() => {
		if (auth.tone !== 'auth') return;
		const onKey = (e: KeyboardEvent) => {
			const el = e.target as HTMLElement | null;
			const tag = el?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable)
				return;
			if (e.metaKey || e.ctrlKey || e.altKey) return;

			if (e.key === 'Escape' && selectedId) {
				e.preventDefault();
				setSelectedId(null);
				return;
			}

			const down = e.key === 'ArrowDown' || e.key === 'j';
			const up = e.key === 'ArrowUp' || e.key === 'k';
			if (!down && !up) return;
			if (rows.length === 0) return;
			e.preventDefault();

			const at = rows.findIndex((r) => r.thread_id === selectedId);
			const next = down
				? Math.min(at < 0 ? 0 : at + 1, rows.length - 1)
				: Math.max(at < 0 ? 0 : at - 1, 0);
			setSelectedId(rows[next].thread_id);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [auth.tone, rows, selectedId]);

	const replyTo = lastInbound(detail);
	const canReply = replyTo !== null;

	const submitReply = async () => {
		if (!detail || !replyTo || sending) return;
		setSending(true);
		setSendResult(null);
		try {
			await sendMail({
				to: replyTo.from_addr,
				subject: replySubject(detail.subject),
				body: draft,
				in_reply_to: replyTo.message_id,
			});
			setSendResult({ ok: true, text: `Sent to ${replyTo.from_addr}.` });
			setDraft('');
			setComposing(false);
			void load(null, filter);
			void getThread(detail.thread_id)
				.then(setDetail)
				.catch(() => {});
		} catch (err) {
			setSendResult({ ok: false, text: describeSendError(err) });
		} finally {
			setSending(false);
		}
	};

	if (auth.tone === 'loading') {
		return (
			<div className="hm-shell hm-center">
				<div className="hm-spinner" aria-label="Loading" />
			</div>
		);
	}

	if (auth.tone !== 'auth') {
		return (
			<div className="hm-shell hm-center">
				<div className="hm-gate">
					<Inbox size={36} />
					<h2>Your inbox lives here</h2>
					<p>
						Sign in with your KBVE account. Your username becomes
						your address.
					</p>
					<button
						type="button"
						className="hm-btn hm-btn-accent"
						onClick={() => openModal('signin')}>
						<LogIn size={16} /> Sign in
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={`hm-shell ${selectedId ? 'hm-has-detail' : ''}`}>
			<aside className="hm-list">
				<div className="hm-toolbar">
					<div className="hm-tabs" role="tablist">
						{(['all', 'in', 'out'] as Filter[]).map((f) => (
							<button
								key={f}
								type="button"
								role="tab"
								aria-selected={filter === f}
								className={`hm-tab ${filter === f ? 'is-active' : ''}`}
								onClick={() => setFilter(f)}>
								{f === 'all'
									? 'All'
									: f === 'in'
										? 'Inbox'
										: 'Sent'}
							</button>
						))}
					</div>
					<button
						type="button"
						className="hm-icon-btn"
						title="Refresh"
						onClick={() => void load(null, filter)}
						disabled={loading}>
						<RefreshCw
							size={16}
							className={loading ? 'hm-spin' : ''}
						/>
					</button>
				</div>

				{loadError && (
					<div className="hm-alert hm-alert-error">
						<AlertCircle size={16} /> {loadError}
					</div>
				)}

				{!loading && !loadError && visible.length === 0 && (
					<div className="hm-empty">
						<Inbox size={28} />
						<p>Nothing here yet.</p>
						<p className="hm-muted">
							Mail sent to your address shows up within seconds.
						</p>
					</div>
				)}

				<ul className="hm-rows">
					{visible.map((row) => (
						<li key={row.thread_id}>
							<button
								type="button"
								className={`hm-row ${row.thread_id === selectedId ? 'is-selected' : ''}`}
								ref={
									row.thread_id === selectedId
										? (el) =>
												el?.scrollIntoView({
													block: 'nearest',
												})
										: undefined
								}
								onClick={() => setSelectedId(row.thread_id)}>
								<span className="hm-row-dir" aria-hidden="true">
									{row.last_direction === 'in' ? (
										<Inbox size={14} />
									) : (
										<Send size={14} />
									)}
								</span>
								<span className="hm-row-main">
									<span className="hm-row-top">
										<span className="hm-row-who">
											{others(row.participants, self)}
										</span>
										<span className="hm-row-when">
											{fmtDate(row.last_activity)}
										</span>
									</span>
									<span className="hm-row-subject">
										{row.subject?.trim() || '(no subject)'}
										{row.message_count > 1 && (
											<span
												className="hm-thread-count"
												title={`${row.message_count} messages`}>
												<MessagesSquare
													size={11}
													aria-hidden="true"
												/>
												{row.message_count}
											</span>
										)}
									</span>
									{row.last_snippet && (
										<span className="hm-row-snippet">
											{row.last_snippet}
										</span>
									)}
								</span>
								{row.has_failure && (
									<span className="hm-badge hm-badge-error">
										failed
									</span>
								)}
							</button>
						</li>
					))}
				</ul>

				{!exhausted && rows.length > 0 && (
					<button
						type="button"
						className="hm-btn hm-btn-ghost hm-more"
						disabled={loading}
						onClick={() =>
							void load(
								threadCursorOf(rows[rows.length - 1]),
								filter,
							)
						}>
						Load older
					</button>
				)}
			</aside>

			<section className="hm-detail">
				{!selectedId && (
					<div className="hm-center hm-muted hm-detail-empty">
						Select a conversation.
					</div>
				)}

				{selectedId && detailLoading && (
					<div className="hm-center">
						<div className="hm-spinner" aria-label="Loading" />
					</div>
				)}

				{selectedId && !detailLoading && !detail && (
					<div className="hm-center hm-muted">
						Conversation unavailable.
					</div>
				)}

				{detail && !detailLoading && (
					<article className="hm-message">
						<button
							type="button"
							className="hm-icon-btn hm-back"
							onClick={() => setSelectedId(null)}
							title="Back">
							<ArrowLeft size={16} />
						</button>
						<header className="hm-message-head">
							<h2>{detail.subject?.trim() || '(no subject)'}</h2>
							<p className="hm-muted hm-thread-meta">
								{detail.messages.length}{' '}
								{detail.messages.length === 1
									? 'message'
									: 'messages'}
								{' · '}
								{others(
									Array.from(
										new Set(
											detail.messages.flatMap((m) =>
												[m.from_addr, m.to_addr].filter(
													(a): a is string =>
														Boolean(a),
												),
											),
										),
									),
									self,
								)}
							</p>
						</header>

						<ol className="hm-transcript">
							{detail.messages.map((m) => (
								<li
									key={m.id}
									className={`hm-turn ${m.direction === 'out' ? 'is-out' : 'is-in'}`}>
									<div className="hm-turn-head">
										<span className="hm-turn-who">
											{m.direction === 'in' ? (
												<Inbox
													size={13}
													aria-hidden="true"
												/>
											) : (
												<Send
													size={13}
													aria-hidden="true"
												/>
											)}
											{m.from_addr}
										</span>
										<time
											className="hm-turn-when"
											dateTime={
												m.sent_at ?? m.received_at
											}>
											{new Date(
												m.sent_at ?? m.received_at,
											).toLocaleString()}
										</time>
									</div>

									{m.direction === 'out' && m.error && (
										<p className="hm-alert hm-alert-error hm-turn-error">
											<AlertCircle size={14} /> {m.error}
										</p>
									)}

									{m.body.attachments.length > 0 && (
										<ul className="hm-attachments">
											{m.body.attachments.map((a, i) => (
												<li key={i}>
													<Paperclip size={14} />
													{a.name ??
														'attachment'}{' '}
													<span className="hm-muted">
														{a.content_type ?? ''}{' '}
														{Math.max(
															1,
															Math.round(
																a.size / 1024,
															),
														)}{' '}
														KB
													</span>
												</li>
											))}
										</ul>
									)}

									<MessageBody
										text={m.body.text}
										html={m.body.html}
										truncated={m.body_truncated}
									/>
								</li>
							))}
						</ol>

						{sendResult && (
							<div
								className={`hm-alert ${sendResult.ok ? 'hm-alert-ok' : 'hm-alert-error'}`}>
								{sendResult.ok ? (
									<CheckCircle2 size={16} />
								) : (
									<AlertCircle size={16} />
								)}{' '}
								{sendResult.text}
							</div>
						)}

						{canReply && !composing && (
							<button
								type="button"
								className="hm-btn hm-btn-accent"
								onClick={() => {
									setComposing(true);
									setSendResult(null);
									if (!draft.trim())
										setDraft(quoted(replyTo));
								}}>
								<Reply size={16} /> Reply
							</button>
						)}

						{canReply && composing && (
							<form
								className="hm-compose"
								onSubmit={(e) => {
									e.preventDefault();
									void submitReply();
								}}>
								<div className="hm-compose-meta">
									<span>
										To <strong>{replyTo?.from_addr}</strong>
									</span>
									<span className="hm-muted">
										{replySubject(detail.subject)}
									</span>
								</div>
								<textarea
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									rows={8}
									maxLength={60000}
									placeholder="Write your reply…"
									required
								/>
								<div className="hm-compose-actions">
									<button
										type="button"
										className="hm-btn hm-btn-ghost"
										onClick={() => setComposing(false)}
										disabled={sending}>
										Cancel
									</button>
									<button
										type="submit"
										className="hm-btn hm-btn-accent"
										disabled={sending || !draft.trim()}>
										<Send size={16} />
										{sending ? 'Sending…' : 'Send'}
									</button>
								</div>
							</form>
						)}
					</article>
				)}
			</section>
		</div>
	);
}
