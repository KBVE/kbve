/** @jsxImportSource react */
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type FormEvent,
} from 'react';
import { useStore } from '@nanostores/react';
import {
	$activeChannel,
	$activeMessages,
	$activeUsers,
	$avatarUrl,
	$canSend,
	$channelList,
	$connectionStatus,
	$error,
	$nick,
	onMessage,
	switchChannel,
	type ChatMessage,
	type ConnectionStatus,
} from './state';
import { joinChannel, partChannel, sendChat } from './transport';
import { formatTime, nickColor, nickInitial } from './format';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
	connected: 'Online',
	connecting: 'Connecting…',
	disconnected: 'Offline',
	error: 'Error',
};

const PROTECTED = new Set(['#general']);

const TopBar: React.FC = () => {
	const channel = useStore($activeChannel);
	const status = useStore($connectionStatus);
	const error = useStore($error);
	const avatar = useStore($avatarUrl);
	const nick = useStore($nick);
	const channelName = channel.replace(/^#/, '');

	return (
		<header className="topbar">
			<div className="brand">
				<span className="brand-dot">K</span>
				<span>KBVE Chat</span>
			</div>
			<div className="channel-pill">
				<span className="channel-pill-hash">#</span>
				<span>{channelName}</span>
			</div>
			<div className="spacer" />
			<div className="status" title={error || STATUS_LABEL[status]}>
				<span className={`status-dot ${status}`} />
				<span>{STATUS_LABEL[status]}</span>
			</div>
			{nick && avatar ? (
				<img
					src={avatar}
					alt={nick}
					title={nick}
					className="me-avatar"
				/>
			) : nick ? (
				<span
					className="me-avatar"
					title={nick}
					style={{ background: nickColor(nick) }}>
					{nickInitial(nick)}
				</span>
			) : null}
		</header>
	);
};

const ChannelRail: React.FC = () => {
	const channels = useStore($channelList);
	const active = useStore($activeChannel);

	return (
		<aside className="rail">
			<div className="rail-head">Channels</div>
			<div className="rail-list">
				{channels.length === 0 && (
					<div className="empty">No channels yet</div>
				)}
				{channels.map((ch) => (
					<div
						key={ch.name}
						style={{ position: 'relative', display: 'flex' }}>
						<button
							type="button"
							className={`channel-item ${active === ch.name ? 'active' : ''}`}
							onClick={() => switchChannel(ch.name)}>
							<span className="channel-item-name">{ch.name}</span>
							{ch.unread > 0 && (
								<span className="badge">
									{ch.unread > 99 ? '99+' : ch.unread}
								</span>
							)}
						</button>
						{!PROTECTED.has(ch.name.toLowerCase()) && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									partChannel(ch.name);
								}}
								title={`Leave ${ch.name}`}
								aria-label={`Leave ${ch.name}`}
								style={{
									position: 'absolute',
									right: 4,
									top: '50%',
									transform: 'translateY(-50%)',
									width: 18,
									height: 18,
									border: 'none',
									background: 'transparent',
									color: 'var(--kbc-text-muted)',
									cursor: 'pointer',
									fontSize: 13,
								}}>
								×
							</button>
						)}
					</div>
				))}
			</div>
		</aside>
	);
};

const MessageRow: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
	if (msg.type === 'message') {
		return (
			<div className={`msg ${msg.type}`}>
				<span className="msg-time">{formatTime(msg.timestamp)}</span>
				<span
					className="msg-nick"
					style={{ color: nickColor(msg.nick) }}>
					{msg.nick}
				</span>
				<span className="msg-content">{msg.content}</span>
			</div>
		);
	}
	return (
		<div className={`msg ${msg.type}`}>
			<span className="msg-time">{formatTime(msg.timestamp)}</span>
			<span className="msg-content">{msg.content}</span>
		</div>
	);
};

const Feed: React.FC = () => {
	const messages = useStore($activeMessages);
	const channel = useStore($activeChannel);
	const containerRef = useRef<HTMLDivElement>(null);
	const isNearBottom = useRef(true);

	const handleScroll = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		isNearBottom.current =
			el.scrollHeight - el.scrollTop - el.clientHeight < 80;
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [channel]);

	useEffect(() => {
		const unsub = onMessage(() => {
			if (!isNearBottom.current) return;
			queueMicrotask(() => {
				const el = containerRef.current;
				if (el) el.scrollTop = el.scrollHeight;
			});
		});
		return unsub;
	}, []);

	return (
		<div className="feed" ref={containerRef} onScroll={handleScroll}>
			{messages.length === 0 && (
				<div className="empty">No messages yet — be the first.</div>
			)}
			{messages.map((m) => (
				<MessageRow key={m.id} msg={m} />
			))}
		</div>
	);
};

const Composer: React.FC = () => {
	const status = useStore($connectionStatus);
	const canSend = useStore($canSend);
	const nick = useStore($nick);
	const avatar = useStore($avatarUrl);
	const [value, setValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const disabled = status !== 'connected' || !canSend;

	const handleSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			const trimmed = value.trim();
			if (!trimmed || disabled) return;
			if (trimmed.startsWith('/join ')) {
				const ch = trimmed.slice(6).trim();
				if (ch) joinChannel(ch.startsWith('#') ? ch : `#${ch}`);
			} else if (trimmed.startsWith('/part')) {
				const ch = trimmed.slice(5).trim();
				partChannel(ch || $activeChannel.get());
			} else {
				sendChat(trimmed);
			}
			setValue('');
			inputRef.current?.focus();
		},
		[value, disabled],
	);

	if (!canSend) {
		return (
			<div className="readonly-notice">
				Read-only mode.{' '}
				<a
					href="https://chat.kbve.com/auth"
					target="_blank"
					rel="noopener noreferrer">
					Sign in at chat.kbve.com →
				</a>
			</div>
		);
	}

	return (
		<form className="composer" onSubmit={handleSubmit}>
			<div className="composer-row">
				{avatar ? (
					<img src={avatar} alt={nick} className="composer-avatar" />
				) : (
					<span
						className="composer-avatar"
						style={{
							background: nick ? nickColor(nick) : undefined,
						}}>
						{nickInitial(nick || '?')}
					</span>
				)}
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={disabled ? 'Not connected' : 'Send a message…'}
					disabled={disabled}
					className="composer-input"
				/>
				<button
					type="submit"
					disabled={disabled || !value.trim()}
					className="send">
					Send
				</button>
			</div>
		</form>
	);
};

const Users: React.FC = () => {
	const users = useStore($activeUsers);
	const self = useStore($nick);
	const selfAvatar = useStore($avatarUrl);

	return (
		<aside className="users">
			<div className="users-head">Members ({users.length})</div>
			<div className="users-list">
				{users.length === 0 && (
					<div className="empty">No one here yet</div>
				)}
				{users.map((u) => {
					const color = nickColor(u);
					const isSelf = u === self;
					return (
						<div key={u} className="user-item">
							{isSelf && selfAvatar ? (
								<img
									src={selfAvatar}
									alt={u}
									className="user-avatar"
								/>
							) : (
								<span
									className="user-avatar"
									style={{ background: color }}>
									{nickInitial(u)}
								</span>
							)}
							<span style={{ color }}>{u}</span>
						</div>
					);
				})}
			</div>
		</aside>
	);
};

export const EmbedChat: React.FC = () => (
	<div className="root">
		<TopBar />
		<div className="body">
			<ChannelRail />
			<div className="main">
				<Feed />
				<Composer />
			</div>
			<Users />
		</div>
	</div>
);
