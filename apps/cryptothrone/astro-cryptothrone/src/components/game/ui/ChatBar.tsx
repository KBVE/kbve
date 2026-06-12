import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';
import { useGameSelector } from '../store/GameStoreContext';

interface ChatLine {
	id: number;
	from: string;
	text: string;
	at: string;
}

const MAX_LINES = 50;
const MAX_INPUT = 200;

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

export function ChatBar() {
	const me = useGameSelector((s) => s.player.stats.username);
	const [lines, setLines] = useState<ChatLine[]>([]);
	const [draft, setDraft] = useState('');
	const [focused, setFocused] = useState(false);
	const [unread, setUnread] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const focusedRef = useRef(false);
	focusedRef.current = focused;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				inputRef.current?.blur();
				return;
			}
			if (e.key !== 'Enter') return;
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement
			)
				return;
			e.preventDefault();
			inputRef.current?.focus();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => {
		return laserEvents.on('chat:message', (data) => {
			const msg = data as { from: string; text: string };
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
			if (!focusedRef.current) setUnread((n) => n + 1);
		});
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [lines]);

	useEffect(() => {
		if (focused) setUnread(0);
	}, [focused]);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const text = draft.trim();
		if (!text) return;
		laserEvents.emit('chat:send', { text });
		setDraft('');
	};

	const dimmed = !focused && lines.length > 0;

	return (
		<div
			className={`absolute bottom-3 left-3 z-40 w-80 select-none transition-opacity duration-300 ${
				dimmed ? 'opacity-70 hover:opacity-100' : 'opacity-100'
			}`}>
			<div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-xl shadow-black/40 backdrop-blur-xl">
				<div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
					<span className="text-[0.65rem] font-semibold uppercase tracking-widest text-amber-300/80">
						Realm chat
					</span>
					{unread > 0 && (
						<span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[0.6rem] font-bold leading-none text-black">
							{unread}
						</span>
					)}
				</div>
				{lines.length > 0 && (
					<div
						ref={scrollRef}
						className="max-h-40 space-y-1 overflow-y-auto px-3 py-2 text-xs [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
						{lines.map((line) => {
							const mine = line.from === me;
							return (
								<div
									key={line.id}
									className="break-words leading-snug">
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
									<span className="text-stone-200">
										{line.text}
									</span>
								</div>
							);
						})}
					</div>
				)}
				<form
					onSubmit={submit}
					className="flex items-center gap-2 border-t border-white/5 px-2 py-1.5">
					<input
						ref={inputRef}
						type="text"
						value={draft}
						maxLength={MAX_INPUT}
						onChange={(e) => setDraft(e.target.value)}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === 'Escape') inputRef.current?.blur();
						}}
						placeholder="Press Enter to chat…"
						aria-label="Chat message"
						className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs text-white placeholder-stone-500 outline-none"
					/>
					{draft.length > MAX_INPUT - 40 && (
						<span className="text-[0.6rem] tabular-nums text-stone-500">
							{MAX_INPUT - draft.length}
						</span>
					)}
					<button
						type="submit"
						disabled={!draft.trim()}
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
		</div>
	);
}
