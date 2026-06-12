import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';

interface ChatLine {
	id: number;
	from: string;
	text: string;
}

const MAX_LINES = 6;
const MAX_INPUT = 200;

let lineCounter = 0;

export function ChatBar() {
	const [lines, setLines] = useState<ChatLine[]>([]);
	const [draft, setDraft] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		return laserEvents.on('chat:message', (data) => {
			const msg = data as { from: string; text: string };
			setLines((prev) =>
				[
					...prev,
					{ id: ++lineCounter, from: msg.from, text: msg.text },
				].slice(-MAX_LINES),
			);
		});
	}, []);

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const text = draft.trim();
		if (!text) return;
		laserEvents.emit('chat:send', { text });
		setDraft('');
		inputRef.current?.blur();
	};

	return (
		<div className="absolute bottom-2 left-2 z-40 w-72 select-none">
			{lines.length > 0 && (
				<ul className="mb-1 space-y-0.5 rounded bg-black/50 p-2 text-xs text-white backdrop-blur-sm">
					{lines.map((line) => (
						<li key={line.id} className="break-words">
							<span className="font-semibold text-cyan-300">
								{line.from}:
							</span>{' '}
							{line.text}
						</li>
					))}
				</ul>
			)}
			<form onSubmit={submit}>
				<input
					ref={inputRef}
					type="text"
					value={draft}
					maxLength={MAX_INPUT}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => e.stopPropagation()}
					placeholder="Say something…"
					aria-label="Chat message"
					className="w-full rounded border border-white/20 bg-black/60 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none backdrop-blur-sm focus:border-cyan-400"
				/>
			</form>
		</div>
	);
}
