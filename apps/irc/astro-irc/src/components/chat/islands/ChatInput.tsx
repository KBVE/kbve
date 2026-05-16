/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$activeChannel,
	$connectionStatus,
	$nick,
	joinChannel,
	partChannel,
	sendMessage,
} from '../service';
import { $avatarUrl } from '../auth';
import { nickColor, nickInitial } from '../format';

const encoder = new TextEncoder();

export const ChatInput: React.FC = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState('');
	const status = useStore($connectionStatus);
	const nick = useStore($nick);
	const avatar = useStore($avatarUrl);
	const disabled = status !== 'connected';

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = value.trim();
			if (!trimmed || disabled) return;

			if (trimmed.startsWith('/join ')) {
				const ch = trimmed.slice(6).trim();
				if (ch) joinChannel(ch.startsWith('#') ? ch : `#${ch}`);
			} else if (trimmed.startsWith('/part')) {
				const ch = trimmed.slice(5).trim();
				partChannel(ch || $activeChannel.get());
			} else if (trimmed.startsWith('/nick ')) {
				const kbve = (window as any).kbve;
				if (kbve?.ws) {
					kbve.ws.send(
						encoder.encode(`NICK ${trimmed.slice(6).trim()}\r\n`),
					);
				}
			} else {
				sendMessage(trimmed);
			}

			setValue('');
			inputRef.current?.focus();
		},
		[value, disabled],
	);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<form className="kbve-chat__composer" onSubmit={handleSubmit}>
			<div className="kbve-chat__composer-row">
				{avatar ? (
					<img
						src={avatar}
						alt={nick}
						className="kbve-chat__composer-avatar"
						loading="lazy"
					/>
				) : (
					<span
						className="kbve-chat__composer-avatar kbve-chat__composer-avatar--initial"
						style={{
							background: nick ? nickColor(nick) : undefined,
						}}>
						{nickInitial(nick || '?')}
					</span>
				)}
				<span className="kbve-chat__composer-nick">{nick || '…'}</span>
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={disabled ? 'Not connected' : 'Send a message…'}
					disabled={disabled}
					className="kbve-chat__composer-input"
				/>
				<button
					type="submit"
					disabled={disabled || !value.trim()}
					className="kbve-chat__send">
					Send
				</button>
			</div>
		</form>
	);
};
