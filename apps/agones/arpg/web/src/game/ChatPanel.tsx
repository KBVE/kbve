import { useEffect, useRef, useState } from 'react';
import {
	createChatClient,
	type RealmChatClient,
	type RealmChatState,
} from '@kbve/laser';
import { ARPG_CHAT } from './config';
import { getNetConfig } from './net-config';
import { onChatToggle, emitChatFocus } from './systems/hud';
import { GOTHIC } from './ui/gothic/svg';
import { GothicFrame } from './ui/gothic/GothicFrame';
import { ChevronIcon, ChatIcon, NewsIcon, TipsIcon } from './ui/gothic/icons';

type Tab = 'chat' | 'news' | 'tips';

// First-run flag: new players land on the Tips tab (opened) once, then default
// to Chat on every later visit. Persisted so the onboarding nudge fires just once.
const TIPS_SEEN_KEY = 'arpg-tips-seen';
const isFirstVisit = (): boolean => {
	try {
		return !localStorage.getItem(TIPS_SEEN_KEY);
	} catch {
		return false;
	}
};

interface ChatLine {
	from: string;
	text: string;
}

const MAX_LINES = 80;
const INK = '#cabfa4';
const INK_NAME = '#c7a866';
const INK_MUTED = '#8a7d63';

/**
 * arpg realm chat — its own minimal UI over the shared laser RealmChatClient.
 * Routes `?game=arpg` to #general through the irc-gateway (GAME_PROFILES). The
 * UI stays arpg-local (each game styles its own); only the client + wire are
 * shared via @kbve/laser.
 */
export default function ChatPanel() {
	const [lines, setLines] = useState<ChatLine[]>([]);
	const [draft, setDraft] = useState('');
	const [hovered, setHovered] = useState(false);
	const [inputFocused, setInputFocused] = useState(false);
	const firstVisit = useRef(isFirstVisit());
	const [pinned, setPinned] = useState(firstVisit.current);
	const [tab, setTab] = useState<Tab>(firstVisit.current ? 'tips' : 'chat');
	const [state, setState] = useState<RealmChatState>({
		status: 'closed',
		attempts: 0,
	});
	const clientRef = useRef<RealmChatClient | null>(null);
	const logRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Expanded while the player is using it (hover, typing, or pinned open via
	// the floating tab); otherwise it collapses to a faded peek of the last few
	// lines so it doesn't hog screen.
	const active = hovered || inputFocused || pinned;

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

	// Burn the first-visit flag once mounted, so the Tips auto-open is one-shot.
	useEffect(() => {
		if (!firstVisit.current) return;
		try {
			localStorage.setItem(TIPS_SEEN_KEY, '1');
		} catch {
			/* private mode — re-nudge next session is fine */
		}
	}, []);

	useEffect(() => {
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [lines, active]);

	// "/" (Action.ToggleChat) is read by the scene's input router and bridged here
	// via CHAT_TOGGLE — additive to the tab buttons. The router gates ToggleChat in
	// the Chat context (input focused), so "/" only fires this OPEN path from
	// gameplay; closing/typing is the focused DOM input's own onKeyDown.
	useEffect(() => {
		return onChatToggle(() => {
			if (tab === 'chat' && pinned) {
				setPinned(false);
				inputRef.current?.blur();
			} else {
				setTab('chat');
				setPinned(true);
				inputRef.current?.focus();
			}
		});
	}, [tab, pinned]);

	// Clicking the chat box activates it: pin open + focus the input (chat tab).
	const activateChat = () => {
		if (tab !== 'chat') return;
		setPinned(true);
		inputRef.current?.focus();
	};

	const send = () => {
		const text = draft.trim();
		if (!text) return;
		clientRef.current?.send(text);
		setDraft('');
	};

	const connected = state.status === 'connected';

	// Clicking the current tab toggles collapse; clicking the other switches to
	// it and expands (focusing chat input only when that's the chat tab).
	const selectTab = (next: Tab) => {
		if (tab === next) {
			setPinned((p) => !p);
			return;
		}
		setTab(next);
		setPinned(true);
		if (next === 'chat') inputRef.current?.focus();
		else inputRef.current?.blur();
	};

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				position: 'absolute',
				left: 12,
				bottom: 132,
				width: 320,
				maxWidth: 'calc(100vw - 24px)',
				fontFamily: 'monospace',
				zIndex: 15,
				pointerEvents: 'auto',
			}}>
			{/* Floating tab row — sits ABOVE the panel, controls never layered on it. */}
			<div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
				<TabButton
					selected={tab === 'chat'}
					onClick={() => selectTab('chat')}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: 9999,
							background: connected ? '#4caf50' : '#c0392b',
							boxShadow: connected
								? '0 0 6px rgba(74,175,80,0.7)'
								: 'none',
						}}
					/>
					<ChatIcon size={13} />
					Chat
					{tab === 'chat' && (
						<ChevronIcon
							size={13}
							open={active}
							style={{ marginLeft: 2 }}
						/>
					)}
				</TabButton>
				<TabButton
					selected={tab === 'news'}
					onClick={() => selectTab('news')}>
					<NewsIcon size={13} />
					News
					{tab === 'news' && (
						<ChevronIcon
							size={13}
							open={active}
							style={{ marginLeft: 2 }}
						/>
					)}
				</TabButton>
				<TabButton
					selected={tab === 'tips'}
					onClick={() => selectTab('tips')}>
					<TipsIcon size={13} />
					Tips
					{tab === 'tips' && (
						<ChevronIcon
							size={13}
							open={active}
							style={{ marginLeft: 2 }}
						/>
					)}
				</TabButton>
			</div>

			<GothicFrame
				variant="bracket"
				width={16}
				padding="12px 14px"
				style={{
					opacity: active ? 1 : 0.9,
					transition: 'opacity 0.2s ease',
					filter: 'drop-shadow(0 8px 22px rgba(0,0,0,0.55))',
				}}>
				{tab === 'chat' ? (
					<>
						<div
							ref={logRef}
							onClick={activateChat}
							style={{
								cursor: 'text',
								height: active ? 162 : 52,
								overflowY: active ? 'auto' : 'hidden',
								maskImage: active
									? undefined
									: 'linear-gradient(to bottom, transparent, #000 22px)',
								WebkitMaskImage: active
									? undefined
									: 'linear-gradient(to bottom, transparent, #000 22px)',
								fontSize: 12,
								lineHeight: 1.5,
								color: INK,
								textShadow: '0 1px 1px rgba(0,0,0,0.6)',
								transition: 'height 0.2s ease',
							}}>
							{lines.length === 0 ? (
								<div
									style={{
										color: INK_MUTED,
										fontStyle: 'italic',
									}}>
									{connected
										? 'Say hello to the realm…'
										: 'Connecting…'}
								</div>
							) : (
								lines.map((l, i) => (
									<div key={i} style={{ marginBottom: 2 }}>
										<span
											style={{
												color: INK_NAME,
												fontWeight: 700,
											}}>
											{l.from}
										</span>
										<span style={{ color: INK_MUTED }}>
											:{' '}
										</span>
										<span>{l.text}</span>
									</div>
								))
							)}
						</div>

						<div
							style={{
								display: 'flex',
								gap: 6,
								marginTop: active ? 10 : 0,
								height: active ? 32 : 0,
								overflow: 'hidden',
								opacity: active ? 1 : 0,
								transition:
									'height 0.2s ease, opacity 0.2s ease, margin-top 0.2s ease',
							}}>
							<input
								ref={inputRef}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onFocus={() => {
									setInputFocused(true);
									emitChatFocus(true);
								}}
								onBlur={() => {
									setInputFocused(false);
									emitChatFocus(false);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') send();
									// "/" on an empty message closes the chat, so the
									// same key toggles open/closed; with text typed it
									// inserts normally (slash-command friendly).
									else if (e.key === '/' && draft === '') {
										e.preventDefault();
										setPinned(false);
										inputRef.current?.blur();
									}
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
									color: '#e6ddc4',
									background: 'rgba(8,7,5,0.7)',
									border: '1px solid #4a3f2c',
									borderRadius: 4,
									outline: 'none',
								}}
							/>
							<button
								type="button"
								onClick={send}
								disabled={!connected}
								style={{
									padding: '6px 14px',
									fontSize: 12,
									fontWeight: 700,
									color: '#1a140c',
									background: connected
										? '#c7a866'
										: '#4a3f2c',
									border: 'none',
									borderRadius: 4,
									cursor: connected ? 'pointer' : 'default',
								}}>
								Send
							</button>
						</div>
					</>
				) : tab === 'news' ? (
					<NewsPanel active={active} />
				) : (
					<TipsPanel active={active} />
				)}
			</GothicFrame>
		</div>
	);
}

function NewsPanel({ active }: { active: boolean }) {
	return (
		<div
			style={{
				height: active ? 202 : 52,
				overflowY: active ? 'auto' : 'hidden',
				maskImage: active
					? undefined
					: 'linear-gradient(to bottom, transparent, #000 22px)',
				WebkitMaskImage: active
					? undefined
					: 'linear-gradient(to bottom, transparent, #000 22px)',
				fontSize: 12,
				lineHeight: 1.5,
				color: INK,
				textShadow: '0 1px 1px rgba(0,0,0,0.6)',
				transition: 'height 0.2s ease',
			}}>
			<div
				style={{
					color: INK_NAME,
					fontWeight: 700,
					letterSpacing: 0.5,
					marginBottom: 8,
				}}>
				Latest News from Rent Earth
			</div>
			<div style={{ color: INK_MUTED, fontStyle: 'italic' }}>
				No dispatches yet — the realm is quiet. Check back soon.
			</div>
		</div>
	);
}

function TipsPanel({ active }: { active: boolean }) {
	return (
		<div
			style={{
				height: active ? 202 : 52,
				overflowY: active ? 'auto' : 'hidden',
				maskImage: active
					? undefined
					: 'linear-gradient(to bottom, transparent, #000 22px)',
				WebkitMaskImage: active
					? undefined
					: 'linear-gradient(to bottom, transparent, #000 22px)',
				fontSize: 12,
				lineHeight: 1.5,
				color: INK,
				textShadow: '0 1px 1px rgba(0,0,0,0.6)',
				transition: 'height 0.2s ease',
			}}>
			<div
				style={{
					color: INK_NAME,
					fontWeight: 700,
					letterSpacing: 0.5,
					marginBottom: 8,
				}}>
				New Adventurer Tips
			</div>
			<ol style={{ margin: 0, paddingLeft: 18 }}>
				<li style={{ marginBottom: 6 }}>
					<span style={{ color: INK_NAME, fontWeight: 700 }}>
						Shift&nbsp;+&nbsp;1…9
					</span>{' '}
					to use or place an item.
				</li>
				<li style={{ marginBottom: 6 }}>
					The dungeon is dangerous — be careful. PvP is enabled below.
				</li>
			</ol>
		</div>
	);
}

function TabButton({
	selected,
	onClick,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				padding: '5px 11px',
				fontSize: 11,
				fontWeight: 700,
				letterSpacing: 1,
				textTransform: 'uppercase',
				color: selected ? INK_NAME : INK_MUTED,
				textShadow: `0 1px 2px ${GOTHIC.shadow}`,
				background: selected
					? 'rgba(34,27,18,0.96)'
					: 'rgba(16,13,9,0.82)',
				border: `1px solid ${selected ? '#6b5a3e' : '#33291c'}`,
				borderRadius: 6,
				cursor: 'pointer',
				opacity: selected ? 1 : 0.85,
				filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55))',
				transition:
					'color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
			}}>
			{children}
		</button>
	);
}
