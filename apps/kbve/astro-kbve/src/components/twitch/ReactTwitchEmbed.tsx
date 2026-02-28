import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
	twitchService,
	type TwitchTheme,
	type TwitchEmbedType,
} from './ServiceTwitch';

export interface ReactTwitchEmbedProps {
	channel: string;
	type?: TwitchEmbedType;
	theme?: TwitchTheme;
	title?: string;
	frameClassName?: string;
	showControls?: boolean;
	autoplay?: boolean;
	muted?: boolean;
	height?: number | string;
	autosize?: boolean;
}

const ReactTwitchEmbed: React.FC<ReactTwitchEmbedProps> = ({
	channel,
	type = 'both',
	theme = 'auto',
	title = 'Twitch stream',
	frameClassName,
	showControls = true,
	autoplay = false,
	muted = true,
	height,
	autosize = false,
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const streamFrameRef = useRef<HTMLIFrameElement | null>(null);
	const chatFrameRef = useRef<HTMLIFrameElement | null>(null);

	const isLoading = useStore(twitchService.isLoadingAtom);
	const error = useStore(twitchService.errorAtom);
	const embedUrl = useStore(twitchService.embedUrlAtom);
	const chatUrl = useStore(twitchService.chatUrlAtom);
	const chatEnabled = useStore(twitchService.chatEnabledAtom);
	const isMuted = useStore(twitchService.mutedAtom);
	const isFullscreen = useStore(twitchService.isFullscreenAtom);

	const [streamLoaded, setStreamLoaded] = useState(false);
	const [chatLoaded, setChatLoaded] = useState(false);
	const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>('dark');

	// Initialize service on mount
	useEffect(() => {
		twitchService.initialize({
			channel,
			type,
			theme,
			autoplay,
			muted,
		});

		// Set initial theme
		const resolvedTheme =
			theme === 'auto'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: theme;
		setActiveTheme(resolvedTheme);

		// Subscribe to theme changes
		const unsubscribe = twitchService.subscribeToThemeChanges(
			(newTheme) => {
				setActiveTheme(newTheme);
			},
		);

		return () => {
			unsubscribe();
			twitchService.reset();
		};
	}, [channel, type, theme, autoplay, muted]);

	// Update parent container attributes
	useEffect(() => {
		const container = containerRef.current?.closest(
			'[data-twitch-embed]',
		) as HTMLElement | null;
		if (!container) return;

		const allLoaded =
			(type === 'stream' && streamLoaded) ||
			(type === 'chat' && chatLoaded) ||
			(type === 'both' && streamLoaded && chatLoaded);

		if (allLoaded) {
			container.setAttribute('data-loaded', '');
			twitchService.setLoaded();
		} else {
			container.removeAttribute('data-loaded');
		}
	}, [streamLoaded, chatLoaded, type]);

	// Handle stream load
	const handleStreamLoad = useCallback(() => {
		setStreamLoaded(true);
	}, []);

	// Handle chat load
	const handleChatLoad = useCallback(() => {
		setChatLoaded(true);
	}, []);

	// Handle toggle chat
	const handleToggleChat = useCallback(() => {
		twitchService.toggleChat();
	}, []);

	// Handle toggle mute
	const handleToggleMute = useCallback(() => {
		twitchService.toggleMute();
	}, []);

	// Handle toggle fullscreen
	const handleToggleFullscreen = useCallback(() => {
		if (!streamFrameRef.current) return;

		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen();
			twitchService.toggleFullscreen();
		} else {
			document.exitFullscreen();
			twitchService.toggleFullscreen();
		}
	}, []);

	// Render controls
	const renderControls = () => {
		if (!showControls || type === 'chat') return null;

		return (
			<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
				<div className="flex items-center justify-between pointer-events-auto">
					<div className="flex items-center gap-2">
						{/* Mute Toggle */}
						<button
							onClick={handleToggleMute}
							className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
							aria-label={
								isMuted ? 'Unmute stream' : 'Mute stream'
							}>
							{isMuted ? (
								<svg
									className="w-5 h-5 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
									/>
								</svg>
							) : (
								<svg
									className="w-5 h-5 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
									/>
								</svg>
							)}
						</button>

						{/* Chat Toggle (only for 'both' type) */}
						{type === 'both' && (
							<button
								onClick={handleToggleChat}
								className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
								aria-label={
									chatEnabled ? 'Hide chat' : 'Show chat'
								}>
								<svg
									className="w-5 h-5 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
							</button>
						)}
					</div>

					<div className="flex items-center gap-2">
						{/* Fullscreen Toggle */}
						<button
							onClick={handleToggleFullscreen}
							className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
							aria-label={
								isFullscreen
									? 'Exit fullscreen'
									: 'Enter fullscreen'
							}>
							{isFullscreen ? (
								<svg
									className="w-5 h-5 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							) : (
								<svg
									className="w-5 h-5 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
									/>
								</svg>
							)}
						</button>
					</div>
				</div>
			</div>
		);
	};

	// Handle error state
	if (error) {
		return (
			<div className="flex items-center justify-center h-full w-full bg-zinc-900 rounded-2xl">
				<div className="text-center p-8">
					<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
						<svg
							className="w-8 h-8 text-red-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h3 className="text-lg font-semibold text-white mb-2">
						Stream Unavailable
					</h3>
					<p className="text-sm text-zinc-400">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="relative w-full h-full flex group">
			<>
				{/* Stream Embed */}
				{(type === 'stream' || type === 'both') && embedUrl && (
					<div
						className={`${type === 'both' && chatEnabled ? 'flex-1' : 'w-full'} relative h-full`}>
						<iframe
							ref={streamFrameRef}
							src={embedUrl}
							title={`${title} - Twitch stream`}
							className={`w-full h-full border-0 ${frameClassName || (type === 'both' ? 'rounded-l-2xl' : 'rounded-2xl')}`}
							allowFullScreen
							sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
							onLoad={handleStreamLoad}
						/>
						{renderControls()}
					</div>
				)}

				{/* Chat Embed */}
				{type === 'both' && chatEnabled && chatUrl && (
					<div className="w-[340px] h-full flex-shrink-0">
						<iframe
							ref={chatFrameRef}
							src={chatUrl}
							title={`${title} - Twitch chat`}
							className="w-full h-full border-0 rounded-r-2xl"
							allowFullScreen
							sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
							onLoad={handleChatLoad}
						/>
					</div>
				)}

				{/* Chat Only */}
				{type === 'chat' && chatUrl && (
					<iframe
						ref={chatFrameRef}
						src={chatUrl}
						title={`${title} - Twitch chat`}
						className={`w-full h-full border-0 ${frameClassName || 'rounded-2xl'}`}
						sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
						onLoad={handleChatLoad}
					/>
				)}
			</>
		</div>
	);
};

export default ReactTwitchEmbed;
