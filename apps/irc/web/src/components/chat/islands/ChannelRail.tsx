/** @jsxImportSource react */
import { useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$activeChannel,
	$channelList,
	switchChannel,
	joinChannel,
	partChannel,
} from '../service';

const PROTECTED_CHANNELS = new Set(['#general']);

export const ChannelRail: React.FC = () => {
	const channels = useStore($channelList);
	const active = useStore($activeChannel);
	const [showJoin, setShowJoin] = useState(false);
	const [joinInput, setJoinInput] = useState('');

	const handleJoin = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const value = joinInput.trim();
			if (!value) return;
			joinChannel(value.startsWith('#') ? value : `#${value}`);
			setJoinInput('');
			setShowJoin(false);
		},
		[joinInput],
	);

	return (
		<>
			<div className="kbve-chat__rail-head">
				<span className="kbve-chat__rail-label">Channels</span>
				<button
					type="button"
					className={`kbve-chat__icon-btn ${showJoin ? 'kbve-chat__icon-btn--active' : ''}`}
					onClick={() => setShowJoin((v) => !v)}
					title="Join channel"
					aria-label="Join channel">
					+
				</button>
			</div>
			{showJoin && (
				<form onSubmit={handleJoin}>
					<input
						type="text"
						value={joinInput}
						onChange={(e) => setJoinInput(e.target.value)}
						placeholder="#channel"
						autoFocus
						className="kbve-chat__rail-input"
					/>
				</form>
			)}
			<div className="kbve-chat__rail-list">
				{channels.length === 0 && (
					<div
						style={{
							padding: '12px',
							fontSize: '13px',
							color: 'var(--sl-color-gray-4)',
						}}>
						No channels yet
					</div>
				)}
				{channels.map((ch) => {
					const isProtected = PROTECTED_CHANNELS.has(
						ch.name.toLowerCase(),
					);
					return (
						<div
							key={ch.name}
							className={`kbve-chat__channel-row ${active === ch.name ? 'kbve-chat__channel-row--active' : ''}`}>
							<button
								type="button"
								onClick={() => switchChannel(ch.name)}
								className={`kbve-chat__channel-item ${active === ch.name ? 'kbve-chat__channel-item--active' : ''}`}>
								<span className="kbve-chat__channel-item-name">
									{ch.name}
								</span>
								{ch.unread > 0 && (
									<span className="kbve-chat__channel-badge">
										{ch.unread > 99 ? '99+' : ch.unread}
									</span>
								)}
							</button>
							{!isProtected && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										if (
											window.confirm(`Leave ${ch.name}?`)
										) {
											partChannel(ch.name);
										}
									}}
									className="kbve-chat__channel-leave"
									title={`Leave ${ch.name}`}
									aria-label={`Leave ${ch.name}`}>
									×
								</button>
							)}
						</div>
					);
				})}
			</div>
		</>
	);
};
