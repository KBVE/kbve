import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiscordTheme } from './DiscordService';
import {
	createWidgetSrc,
	resolveInitialTheme,
	subscribeToAutoTheme,
} from './DiscordService';

export interface ReactDiscordEmbedProps {
	serverId: string;
	theme: DiscordTheme;
	title: string;
}

const ReactDiscordEmbed = ({
	serverId,
	theme,
	title,
}: ReactDiscordEmbedProps) => {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>(() =>
		resolveInitialTheme(
			theme,
			'dark',
			typeof window !== 'undefined' ? window : undefined,
		),
	);

	// Theme management
	useEffect(() => {
		if (theme === 'dark' || theme === 'light') {
			setActiveTheme(theme);
			return;
		}

		if (typeof window === 'undefined') return;

		setActiveTheme(resolveInitialTheme('auto', 'dark', window));
		return subscribeToAutoTheme(theme, setActiveTheme, window);
	}, [theme]);

	// Reset loaded state on theme/server change
	useEffect(() => {
		setIsLoaded(false);
	}, [activeTheme, serverId]);

	// Sync loaded state with parent container
	useEffect(() => {
		const container = hostRef.current?.closest(
			'[data-discord-embed]',
		) as HTMLElement | null;
		if (!container) return;

		if (isLoaded) {
			container.setAttribute('data-loaded', '');
		} else {
			container.removeAttribute('data-loaded');
		}
	}, [isLoaded]);

	// Intersection observer for lazy loading
	useEffect(() => {
		if (typeof window === 'undefined') return;

		const host = hostRef.current;
		if (!host) return;

		if (!('IntersectionObserver' in window)) {
			setIsVisible(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ threshold: 0.1 },
		);

		observer.observe(host);
		return () => observer.disconnect();
	}, []);

	const frameSrc = useMemo(
		() => createWidgetSrc(serverId, activeTheme),
		[serverId, activeTheme],
	);

	const containerStyle: React.CSSProperties = {
		position: 'relative',
		display: 'flex',
		flexDirection: 'column',
		width: '100%',
		height: '100%',
		padding: '0.5rem',
	};

	const iframeStyle: React.CSSProperties = {
		width: '100%',
		height: '100%',
		flex: 1,
		border: 'none',
		borderRadius: 'calc(1rem - 4px)',
		background: 'transparent',
		opacity: isLoaded ? 1 : 0,
		transition: 'opacity 0.4s ease-out',
	};

	return (
		<div
			ref={hostRef}
			style={containerStyle}
			role="application"
			aria-label={`Discord server widget for ${serverId}`}
			aria-busy={!isLoaded}>
			{isVisible ? (
				<iframe
					key={`${serverId}-${activeTheme}`}
					src={frameSrc}
					title={title}
					loading="lazy"
					referrerPolicy="no-referrer-when-downgrade"
					sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
					style={iframeStyle}
					onLoad={() => setIsLoaded(true)}
					tabIndex={0}
				/>
			) : (
				<span className="sr-only" role="status">
					Loading Discord widget...
				</span>
			)}
		</div>
	);
};

export default ReactDiscordEmbed;
