import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { twitchService } from './ServiceTwitch';

export interface ReactTwitchChatProps {
	channel: string;
	theme?: 'dark' | 'light' | 'auto';
	height?: number | string;
	darkpopout?: boolean;
	autosize?: boolean;
}

const ReactTwitchChat: React.FC<ReactTwitchChatProps> = ({
	channel,
	theme = 'auto',
	height = 500,
	darkpopout = true,
	autosize = false,
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const chatFrameRef = useRef<HTMLIFrameElement | null>(null);
	const [chatLoaded, setChatLoaded] = useState(false);
	const [chatUrl, setChatUrl] = useState<string>('');
	const [containerHeight, setContainerHeight] = useState<string | number>(
		height,
	);

	// Autosize effect - calculate height based on available space
	useEffect(() => {
		if (!autosize || typeof window === 'undefined') return;

		const calculateHeight = () => {
			if (!containerRef.current) return;

			// Get parent container dimensions
			const parent = containerRef.current.parentElement;
			if (!parent) return;

			const parentRect = parent.getBoundingClientRect();

			// Calculate available height
			const siblingElements = Array.from(parent.children).filter(
				(child) => child !== containerRef.current,
			);
			let usedHeight = 0;
			siblingElements.forEach((sibling) => {
				usedHeight += sibling.getBoundingClientRect().height;
			});

			// Set height to available space minus some padding
			const availableHeight = parentRect.height - usedHeight - 32; // 32px for padding
			if (availableHeight > 300) {
				// Minimum height of 300px
				setContainerHeight(availableHeight);
			}
		};

		calculateHeight();
		window.addEventListener('resize', calculateHeight);

		return () => {
			window.removeEventListener('resize', calculateHeight);
		};
	}, [autosize]);

	useEffect(() => {
		// Get all parent domains
		const getParentDomains = (): string[] => {
			if (typeof window === 'undefined') {
				return ['localhost', 'kbve.com'];
			}

			const hostname = window.location.hostname;
			const parents: string[] = [hostname];

			// Add common variations
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				parents.push('localhost', '127.0.0.1');
			} else {
				// Add base domain and www variant
				const isWww = hostname.startsWith('www.');
				const baseDomain = isWww ? hostname.substring(4) : hostname;

				parents.push(baseDomain);
				if (!isWww) {
					parents.push(`www.${baseDomain}`);
				}

				// Add common subdomains for kbve.com
				if (
					baseDomain === 'kbve.com' ||
					hostname.endsWith('.kbve.com')
				) {
					parents.push(
						'kbve.com',
						'www.kbve.com',
						'app.kbve.com',
						'dev.kbve.com',
					);
				}
			}

			// Remove duplicates
			return [...new Set(parents)];
		};

		// Resolve theme
		const resolvedTheme =
			theme === 'auto'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: theme;

		// Build chat URL
		const params = new URLSearchParams({
			darkpopout:
				darkpopout || resolvedTheme === 'dark' ? 'true' : 'false',
		});

		// Add all parent domains
		const parents = getParentDomains();
		parents.forEach((parent) => {
			params.append('parent', parent);
		});

		setChatUrl(
			`https://www.twitch.tv/embed/${channel}/chat?${params.toString()}`,
		);
	}, [channel, theme, darkpopout]);

	const handleChatLoad = useCallback(() => {
		setChatLoaded(true);
	}, []);

	const heightValue =
		typeof containerHeight === 'number'
			? `${containerHeight}px`
			: containerHeight;

	return (
		<div
			ref={containerRef}
			className="relative w-full overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 shadow-2xl"
			style={{ height: heightValue }}>
			{/* Loading State */}
			{!chatLoaded && (
				<div className="absolute inset-0 flex items-center justify-center bg-zinc-900 pointer-events-none">
					<div className="text-center">
						<div className="w-12 h-12 border-4 border-purple-600/30 border-t-purple-600 rounded-full animate-spin mb-3"></div>
						<p className="text-sm text-zinc-400">Loading chat...</p>
					</div>
				</div>
			)}

			{/* Chat iframe */}
			{chatUrl && (
				<iframe
					ref={chatFrameRef}
					src={chatUrl}
					title={`${channel} - Twitch chat`}
					className="w-full h-full border-0"
					sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					onLoad={handleChatLoad}
					aria-label={`Twitch chat for ${channel}`}
				/>
			)}
		</div>
	);
};

export default ReactTwitchChat;
