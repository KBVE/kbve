/** @jsxImportSource react */
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
	$activeChannel,
	$activeMessages,
	onMessage,
	type ChatMessage,
} from '../service';
import { formatTime, nickColor } from '../format';

function createMessageNode(msg: ChatMessage): HTMLDivElement {
	const row = document.createElement('div');
	row.className = `kbve-chat__msg kbve-chat__msg--${msg.type}`;

	const time = document.createElement('span');
	time.className = 'kbve-chat__msg-time';
	time.textContent = formatTime(msg.timestamp);
	row.appendChild(time);

	if (msg.type === 'message') {
		const nick = document.createElement('span');
		nick.className = 'kbve-chat__msg-nick';
		nick.style.color = nickColor(msg.nick);
		nick.textContent = msg.nick;
		row.appendChild(nick);

		const content = document.createElement('span');
		content.className = 'kbve-chat__msg-content';
		content.textContent = msg.content;
		row.appendChild(content);
	} else {
		const content = document.createElement('span');
		content.className = 'kbve-chat__msg-content';
		content.textContent = msg.content;
		row.appendChild(content);
	}

	return row;
}

export const MessageFeed: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const isNearBottom = useRef(true);
	const activeChannel = useStore($activeChannel);
	const initialMessages = useStore($activeMessages);

	const handleScroll = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		isNearBottom.current =
			el.scrollHeight - el.scrollTop - el.clientHeight < 80;
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.innerHTML = '';
		for (const msg of initialMessages) {
			el.appendChild(createMessageNode(msg));
		}
		el.scrollTop = el.scrollHeight;
	}, [activeChannel, initialMessages]);

	useEffect(() => {
		return onMessage((msg) => {
			const el = containerRef.current;
			if (!el) return;
			if (msg.channel !== $activeChannel.get()) return;
			el.appendChild(createMessageNode(msg));
			if (isNearBottom.current) {
				el.scrollTop = el.scrollHeight;
			}
		});
	}, []);

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className="kbve-chat__feed"
		/>
	);
};
