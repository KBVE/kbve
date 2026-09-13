import { authBridge } from './supa';

export interface InboxRow {
	id: string;
	direction: 'in' | 'out';
	status: string;
	from_addr: string;
	to_addr: string | null;
	subject: string | null;
	message_id: string | null;
	in_reply_to: string | null;
	received_at: string;
	sent_at: string | null;
	from_username: string | null;
	has_body: boolean;
}

export interface Attachment {
	name: string | null;
	content_type: string | null;
	size: number;
}

export interface MessageDetail extends Omit<InboxRow, 'has_body'> {
	via: string;
	error: string | null;
	body_truncated?: boolean;
	body: {
		text: string | null;
		html: string | null;
		attachments: Attachment[];
	};
}

export interface MailboxStats {
	user_id: string;
	username: string | null;
	address: string | null;
	inbound: number;
	outbound: number;
	sent_24h: number;
	daily_cap: number;
	retention_days: number;
}

export class ApiError extends Error {
	status: number;
	reason: string;
	constructor(status: number, reason: string) {
		super(reason);
		this.status = status;
		this.reason = reason;
	}
}

async function bearer(): Promise<string> {
	const session = await authBridge.getSession();
	if (!session?.access_token) throw new ApiError(401, 'signed_out');
	return session.access_token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = await bearer();
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${token}`);
	if (init.body) headers.set('content-type', 'application/json');
	const res = await fetch(path, { ...init, headers, cache: 'no-store' });
	if (!res.ok) {
		let reason = res.statusText || `http_${res.status}`;
		try {
			const body = (await res.json()) as { error?: string };
			if (body?.error) reason = body.error;
		} catch {
			// non-json error body
		}
		throw new ApiError(res.status, reason);
	}
	return (await res.json()) as T;
}

export type Direction = 'in' | 'out';

export interface Cursor {
	before: string;
	before_id: string;
}

export interface ThreadRow {
	thread_id: string;
	subject: string | null;
	participants: string[];
	message_count: number;
	last_activity: string;
	last_direction: Direction;
	last_status: string;
	last_snippet: string | null;
	has_failure: boolean;
}

export interface ThreadMessage extends Omit<MessageDetail, 'status'> {
	status: string;
}

export interface ThreadDetail {
	thread_id: string;
	subject: string | null;
	messages: ThreadMessage[];
}

export function cursorOf(row: InboxRow): Cursor {
	return { before: row.received_at, before_id: row.id };
}

export function threadCursorOf(row: ThreadRow): Cursor {
	return { before: row.last_activity, before_id: row.thread_id };
}

export function listInbox(
	opts: {
		limit?: number;
		cursor?: Cursor | null;
		direction?: Direction | null;
	} = {},
) {
	const q = new URLSearchParams();
	if (opts.limit) q.set('limit', String(opts.limit));
	if (opts.cursor) {
		q.set('before', opts.cursor.before);
		q.set('before_id', opts.cursor.before_id);
	}
	if (opts.direction) q.set('direction', opts.direction);
	const qs = q.toString();
	return request<{ messages: InboxRow[] }>(
		`/mail/inbox${qs ? `?${qs}` : ''}`,
	);
}

export function listThreads(
	opts: {
		limit?: number;
		cursor?: Cursor | null;
		direction?: Direction | null;
	} = {},
) {
	const q = new URLSearchParams();
	if (opts.limit) q.set('limit', String(opts.limit));
	if (opts.cursor) {
		q.set('before', opts.cursor.before);
		q.set('before_id', opts.cursor.before_id);
	}
	if (opts.direction) q.set('direction', opts.direction);
	const qs = q.toString();
	return request<{ threads: ThreadRow[] }>(
		`/mail/threads${qs ? `?${qs}` : ''}`,
	);
}

export function getThread(id: string) {
	return request<ThreadDetail>(`/mail/threads/${encodeURIComponent(id)}`);
}

export function getMessage(id: string) {
	return request<MessageDetail>(`/mail/messages/${encodeURIComponent(id)}`);
}

export function getMailbox() {
	return request<MailboxStats>('/mail/me');
}

export function sendMail(body: {
	to: string;
	subject: string;
	body: string;
	in_reply_to?: string | null;
}) {
	return request<{ id: string; message_id: string }>('/mail/send', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function describeSendError(err: unknown): string {
	if (!(err instanceof ApiError)) return 'Could not send. Try again.';
	switch (err.reason) {
		case 'not_a_reply':
			return 'You can only reply to people who have written to you first.';
		case 'daily_cap':
			return 'Daily sending limit reached. Try again tomorrow.';
		case 'no_username':
			return 'Pick a username on kbve.com first; it becomes your address.';
		case 'self':
			return 'That is your own address.';
		case 'bad_recipient':
			return 'That address does not look valid.';
		case 'empty_body':
			return 'Write something first.';
		case 'too_large':
		case 'message too large':
			return 'Message is too long (64 KiB max).';
		case 'signed_out':
		case 'token expired':
		case 'invalid token':
			return 'Your session ended. Sign in again.';
		case 'relay failed':
			return 'Mail server refused the message. Try again in a minute.';
		default:
			return `Could not send (${err.reason}).`;
	}
}
