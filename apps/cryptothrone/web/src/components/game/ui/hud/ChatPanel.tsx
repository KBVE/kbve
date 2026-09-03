import { useEffect, useRef, useState } from 'react';
import { RealmChatClient, type RealmChatState } from '@kbve/laser';
import { useGameSelector } from '../../store/GameStoreContext';
import {
	getCtNetConfig,
	resolveChatUrl,
	REALM_CHAT_GAME,
	REALM_CHAT_CHANNEL,
} from '@/lib/net-config';

interface ChatLine {
	id: number;
	from: string;
	text: string;
	at: string;
}

const MAX_LINES = 50;
const MAX_INPUT = 200;

const CLIENT_MAX_PER_WINDOW = 8;
const CLIENT_WINDOW_MS = 10_000;
const CLIENT_MIN_INTERVAL_MS = 600;
const THROTTLE_NOTICE = 'Slow down — sending messages too fast.';

let lineCounter = 0;

const NAME_HUES = [28, 162, 200, 262, 330, 95];

function nameHue(name: string): number {
	let h = 0;
	for (let i = 0; i < name.length; i++) {
		h = (h * 31 + name.charCodeAt(i)) >>> 0;
	}
	return NAME_HUES[h % NAME_HUES.length];
}

function timestamp(): string {
	return new Date().toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

interface ChatPanelProps {
	active: boolean;
	onUnread?: () => void;
	onStatusChange?: (s: RealmChatState) => void;
}

export function ChatPanel({
	active,
	onUnread,
	onStatusChange,
}: ChatPanelProps) {
	const me = useGameSelector((s) => s.player.stats.username);
	const [lines, setLines] = useState<ChatLine[]>([]);
	const [draft, setDraft] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef(active);
	activeRef.current = active;
	const clientRef = useRef<RealmChatClient | null>(null);
	const sendTimesRef = useRef<number[]>([]);
	const [chatState, setChatState] = useState<RealmChatState>({
		status: 'connecting',
		attempts: 0,
	});
	const connected = chatState.status === 'connected';

	useEffect(() => {
		onStatusChange?.(chatState);
	}, [chatState, onStatusChange]);

	useEffect(() => {
		const cfg = getCtNetConfig();
		if (!cfg) {
			setChatState({
				status: 'closed',
				attempts: 0,
				reason: 'not signed in',
			});
			return;
		}
		const client = new RealmChatClient({
			url: resolveChatUrl(),
			jwt: cfg.jwt,
			game: REALM_CHAT_GAME,
			channel: REALM_CHAT_CHANNEL,
		});
		clientRef.current = client;
		const offMsg = client.on('message', (msg) => {
			setLines((prev) =>
				[
					...prev,
					{
						id: ++lineCounter,
						from: msg.from,
						text: msg.text,
						at: timestamp(),
					},
				].slice(-MAX_LINES),
			);
			if (!activeRef.current) onUnread?.();
		});
		const offStatus = client.on('status', (s) => setChatState(s));
		client.connect();
		return () => {
			offMsg();
			offStatus();
			client.close();
			clientRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [lines, active]);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const text = draft.trim();
		if (!text || !connected) return;

		const now = Date.now();
		const recent = sendTimesRef.current.filter(
			(t) => now - t < CLIENT_WINDOW_MS,
		);
		const tooSoon =
			recent.length > 0 &&
			now - recent[recent.length - 1] < CLIENT_MIN_INTERVAL_MS;
		if (tooSoon || recent.length >= CLIENT_MAX_PER_WINDOW) {
			setLines((prev) =>
				prev[prev.length - 1]?.text === THROTTLE_NOTICE
					? prev
					: [
							...prev,
							{
								id: ++lineCounter,
								from: 'system',
								text: THROTTLE_NOTICE,
								at: timestamp(),
							},
						].slice(-MAX_LINES),
			);
			return;
		}
		sendTimesRef.current = [...recent, now];

		clientRef.current?.send(text);
		setLines((prev) =>
			[
				...prev,
				{ id: ++lineCounter, from: me, text, at: timestamp() },
			].slice(-MAX_LINES),
		);
		setDraft('');
	};

	const statusText =
		chatState.status === 'connecting'
			? 'Connecting…'
			: chatState.status === 'reconnecting'
				? `Reconnecting… (try ${chatState.attempts})${
						chatState.reason ? ` — ${chatState.reason}` : ''
					}`
				: chatState.status === 'closed'
					? (chatState.reason ?? 'Disconnected')
					: null;

	return (
		<div className="flex h-full flex-col">
			{statusText && (
				<div
					role="status"
					className={`border-b border-white/5 px-1 py-1 text-[0.65rem] ${
						chatState.status === 'closed'
							? 'text-red-300/90'
							: 'text-amber-200/80'
					}`}>
					{statusText}
				</div>
			)}
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2 text-xs [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
				{lines.map((line) => {
					const mine = line.from === me;
					return (
						<div key={line.id} className="break-words leading-snug">
							<span className="mr-1.5 text-[0.6rem] tabular-nums text-stone-500">
								{line.at}
							</span>
							<span
								className={
									mine
										? 'font-semibold text-amber-300'
										: 'font-semibold'
								}
								style={
									mine
										? undefined
										: {
												color: `hsl(${nameHue(line.from)} 70% 70%)`,
											}
								}>
								{line.from}
							</span>
							<span className="text-stone-500">: </span>
							<span className="text-stone-200">{line.text}</span>
						</div>
					);
				})}
			</div>
			<form
				onSubmit={submit}
				className="flex items-center gap-2 border-t border-white/5 px-1 py-1.5">
				<input
					ref={inputRef}
					type="text"
					value={draft}
					maxLength={MAX_INPUT}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === 'Escape') inputRef.current?.blur();
					}}
					placeholder={connected ? 'Say something…' : 'Chat offline'}
					aria-label="Chat message"
					className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs text-white placeholder-stone-500 outline-none"
				/>
				<button
					type="submit"
					disabled={!draft.trim() || !connected}
					aria-label="Send message"
					className="rounded-md p-1.5 text-amber-300 transition enabled:hover:bg-amber-400/10 disabled:opacity-30">
					<svg
						className="h-3.5 w-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true">
						<path d="m22 2-7 20-4-9-9-4Z" />
						<path d="M22 2 11 13" />
					</svg>
				</button>
			</form>
		</div>
	);
}
