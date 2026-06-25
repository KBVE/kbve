import { useEffect, useRef, useState } from 'react';
import {
	createChatClient,
	type RealmChatClient,
	type RealmChatState,
} from '@kbve/laser';
import { ARPG_CHAT } from './config';
import { getNetConfig } from './net-config';

interface ChatLine {
	from: string;
	text: string;
}

const MAX_LINES = 80;

/**
 * arpg realm chat — its own minimal UI over the shared laser RealmChatClient.
 * Routes `?game=arpg` to #general through the irc-gateway (GAME_PROFILES). The
 * UI stays arpg-local (each game styles its own); only the client + wire are
 * shared via @kbve/laser.
 */
export default function ChatPanel() {
	const [lines, setLines] = useState<ChatLine[]>([]);
	const [draft, setDraft] = useState('');
	const [open, setOpen] = useState(true);
	const [state, setState] = useState<RealmChatState>({
		status: 'closed',
		attempts: 0,
	});
	const clientRef = useRef<RealmChatClient | null>(null);
	const logRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const client = createChatClient(ARPG_CHAT, getNetConfig()?.jwt);
		if (!client) return;
		clientRef.current = client;

		const offMsg = client.on('message', (m) =>
			setLines((prev) =>
				[...prev, { from: m.from, text: m.text }].slice(-MAX_LINES),
			),
		);
		const offState = client.on('status', setState);
		client.connect();

		return () => {
			offMsg();
			offState();
			client.close();
			clientRef.current = null;
		};
	}, []);

	useEffect(() => {
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [lines]);

	const send = () => {
		const text = draft.trim();
		if (!text) return;
		clientRef.current?.send(text);
		setDraft('');
	};

	const connected = state.status === 'connected';

	return (
		<div
			style={{
				position: 'absolute',
				left: 12,
				bottom: 108,
				width: 320,
				maxWidth: 'calc(100vw - 24px)',
				fontFamily: 'monospace',
				color: '#e6ebf5',
				zIndex: 15,
				pointerEvents: 'auto',
			}}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					width: '100%',
					padding: '6px 10px',
					fontSize: 12,
					fontWeight: 700,
					color: '#c7d6ff',
					background: '#181c28',
					border: '1px solid #3c465c',
					borderRadius: open ? '8px 8px 0 0' : 8,
					cursor: 'pointer',
				}}>
				<span
					style={{
						width: 8,
						height: 8,
						borderRadius: 9999,
						background: connected ? '#34d399' : '#f87171',
					}}
				/>
				Chat
				<span style={{ marginLeft: 'auto', color: '#8a93a6' }}>
					{open ? '▾' : '▸'}
				</span>
			</button>

			{open && (
				<div
					style={{
						background: 'rgba(16,19,28,0.92)',
						border: '1px solid #3c465c',
						borderTop: 'none',
						borderRadius: '0 0 8px 8px',
					}}>
					<div
						ref={logRef}
						style={{
							height: 160,
							overflowY: 'auto',
							padding: '8px 10px',
							fontSize: 12,
							lineHeight: 1.45,
						}}>
						{lines.length === 0 ? (
							<div style={{ color: '#8a93a6' }}>
								{connected
									? 'Say hello to the realm…'
									: 'Connecting…'}
							</div>
						) : (
							lines.map((l, i) => (
								<div key={i}>
									<span style={{ color: '#6ea8ff' }}>
										{l.from}
									</span>
									<span style={{ color: '#8a93a6' }}>: </span>
									<span>{l.text}</span>
								</div>
							))
						)}
					</div>
					<div
						style={{
							display: 'flex',
							gap: 6,
							padding: 8,
							borderTop: '1px solid #2a3142',
						}}>
						<input
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') send();
								e.stopPropagation();
							}}
							placeholder={connected ? 'Message…' : 'Offline'}
							disabled={!connected}
							maxLength={200}
							style={{
								flex: 1,
								padding: '6px 8px',
								fontSize: 12,
								fontFamily: 'monospace',
								color: '#e6ebf5',
								background: '#10131c',
								border: '1px solid #3c465c',
								borderRadius: 6,
								outline: 'none',
							}}
						/>
						<button
							type="button"
							onClick={send}
							disabled={!connected}
							style={{
								padding: '6px 12px',
								fontSize: 12,
								fontWeight: 700,
								color: '#0b0e16',
								background: connected ? '#6ea8ff' : '#3c465c',
								border: 'none',
								borderRadius: 6,
								cursor: connected ? 'pointer' : 'default',
							}}>
							Send
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
