import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $auth, openModal } from '@kbve/astro';
import DOMPurify from 'dompurify';
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
} from 'lucide-react';
import { initSupa } from '../../lib/supa';
import {
	ApiError,
	cursorOf,
	describeSendError,
	getMessage,
	listInbox,
	sendMail,
	type Cursor,
	type InboxRow,
	type MessageDetail,
} from '../../lib/api';

const PAGE = 50;

type Filter = 'all' | 'in' | 'out';

function fmtDate(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const now = new Date();
	const sameDay = d.toDateString() === now.toDateString();
	return sameDay
		? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function counterpart(row: InboxRow): string {
	return row.direction === 'in' ? row.from_addr : (row.to_addr ?? '');
}

function replySubject(subject: string | null): string {
	const s = (subject ?? '').trim();
	if (!s) return 'Re:';
	return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export default function ReactInbox() {
	const auth = useStore($auth);
	const [rows, setRows] = useState<InboxRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [exhausted, setExhausted] = useState(false);
	const [filter, setFilter] = useState<Filter>('all');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detail, setDetail] = useState<MessageDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [composing, setComposing] = useState(false);
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const [sendResult, setSendResult] = useState<
		{ ok: true; text: string } | { ok: false; text: string } | null
	>(null);

	useEffect(() => {
		initSupa().catch(() => {});
	}, []);

	const load = useCallback(
		async (cursor?: Cursor | null, dir: Filter = filter) => {
			setLoading(true);
			setLoadError(null);
			try {
				const { messages } = await listInbox({
					limit: PAGE,
					cursor,
					direction: dir === 'all' ? null : dir,
				});
				setRows((prev) => (cursor ? [...prev, ...messages] : messages));
				setExhausted(messages.length < PAGE);
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
		getMessage(selectedId)
			.then((m) => {
				if (!cancelled) setDetail(m);
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

	const canReply = detail?.direction === 'in';

	const submitReply = async () => {
		if (!detail || !canReply || sending) return;
		setSending(true);
		setSendResult(null);
		try {
			await sendMail({
				to: detail.from_addr,
				subject: replySubject(detail.subject),
				body: draft,
				in_reply_to: detail.message_id,
			});
			setSendResult({ ok: true, text: `Sent to ${detail.from_addr}.` });
			setDraft('');
			setComposing(false);
			void load(null, filter);
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
						Sign in with your KBVE account. Your username becomes your
						address.
					</p>
					<button
						type="button"
						className="hm-btn hm-btn-accent"
						onClick={() => openModal('signin')}
					>
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
								onClick={() => setFilter(f)}
							>
								{f === 'all' ? 'All' : f === 'in' ? 'Inbox' : 'Sent'}
							</button>
						))}
					</div>
					<button
						type="button"
						className="hm-icon-btn"
						title="Refresh"
						onClick={() => void load(null, filter)}
						disabled={loading}
					>
						<RefreshCw size={16} className={loading ? 'hm-spin' : ''} />
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
						<li key={row.id}>
							<button
								type="button"
								className={`hm-row ${row.id === selectedId ? 'is-selected' : ''} ${row.status === 'pending' && row.direction === 'in' ? 'is-unread' : ''}`}
								onClick={() => setSelectedId(row.id)}
							>
								<span className="hm-row-dir" aria-hidden="true">
									{row.direction === 'in' ? (
										<Inbox size={14} />
									) : (
										<Send size={14} />
									)}
								</span>
								<span className="hm-row-main">
									<span className="hm-row-top">
										<span className="hm-row-who">
											{counterpart(row)}
										</span>
										<span className="hm-row-when">
											{fmtDate(row.received_at)}
										</span>
									</span>
									<span className="hm-row-subject">
										{row.subject?.trim() || '(no subject)'}
									</span>
								</span>
								{row.direction === 'out' && row.status === 'failed' && (
									<span className="hm-badge hm-badge-error">failed</span>
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
						onClick={() => void load(cursorOf(rows[rows.length - 1]), filter)}
					>
						Load older
					</button>
				)}
			</aside>

			<section className="hm-detail">
				{!selectedId && (
					<div className="hm-center hm-muted hm-detail-empty">
						Select a message.
					</div>
				)}

				{selectedId && detailLoading && (
					<div className="hm-center">
						<div className="hm-spinner" aria-label="Loading" />
					</div>
				)}

				{selectedId && !detailLoading && !detail && (
					<div className="hm-center hm-muted">Message unavailable.</div>
				)}

				{detail && !detailLoading && (
					<article className="hm-message">
						<button
							type="button"
							className="hm-icon-btn hm-back"
							onClick={() => setSelectedId(null)}
							title="Back"
						>
							<ArrowLeft size={16} />
						</button>
						<header className="hm-message-head">
							<h2>{detail.subject?.trim() || '(no subject)'}</h2>
							<dl>
								<dt>From</dt>
								<dd>{detail.from_addr}</dd>
								<dt>To</dt>
								<dd>{detail.to_addr ?? 'you'}</dd>
								<dt>Date</dt>
								<dd>
									{new Date(
										detail.sent_at ?? detail.received_at,
									).toLocaleString()}
								</dd>
								{detail.direction === 'out' && (
									<>
										<dt>Status</dt>
										<dd>
											{detail.status}
											{detail.error ? ` (${detail.error})` : ''}
										</dd>
									</>
								)}
							</dl>
						</header>

						{detail.body.attachments.length > 0 && (
							<ul className="hm-attachments">
								{detail.body.attachments.map((a, i) => (
									<li key={i}>
										<Paperclip size={14} />
										{a.name ?? 'attachment'}{' '}
										<span className="hm-muted">
											{a.content_type ?? ''}{' '}
											{Math.max(1, Math.round(a.size / 1024))} KB
										</span>
									</li>
								))}
							</ul>
						)}

						{detail.body.text ? (
							<pre className="hm-body">{detail.body.text}</pre>
						) : detail.body.html ? (
							<div
								className="hm-body hm-body-html"
								dangerouslySetInnerHTML={{
									__html: DOMPurify.sanitize(detail.body.html, {
										FORBID_TAGS: ['style', 'img', 'svg', 'form', 'input'],
										FORBID_ATTR: ['style', 'srcset'],
									}),
								}}
							/>
						) : (
							<p className="hm-muted">Empty message.</p>
						)}

						{sendResult && (
							<div
								className={`hm-alert ${sendResult.ok ? 'hm-alert-ok' : 'hm-alert-error'}`}
							>
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
								}}
							>
								<Reply size={16} /> Reply
							</button>
						)}

						{canReply && composing && (
							<form
								className="hm-compose"
								onSubmit={(e) => {
									e.preventDefault();
									void submitReply();
								}}
							>
								<div className="hm-compose-meta">
									<span>
										To <strong>{detail.from_addr}</strong>
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
										disabled={sending}
									>
										Cancel
									</button>
									<button
										type="submit"
										className="hm-btn hm-btn-accent"
										disabled={sending || !draft.trim()}
									>
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
