import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
	getRuffleWindow,
	mergeRuffleConfig,
	resolveRuffleScriptUrl,
	RUFFLE_SCRIPT_ID,
	type RuffleCdn,
	type RuffleConfig,
	type RuffleLoadOptions,
	type RufflePlayerElement,
} from './ruffle';

type RuffleStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReactRuffleProps {
	src: string;
	cdn?: RuffleCdn;
	version?: string;
	scriptUrl?: string;
	config?: RuffleConfig;
	loadOptions?: Omit<RuffleLoadOptions, 'url'>;
	className?: string;
	playerClassName?: string;
	style?: CSSProperties;
	width?: number | string;
	height?: number | string;
	title?: string;
	id?: string;
	allowFullscreen?: boolean;
	replaceOnSrcChange?: boolean;
	onReady?: (player: RufflePlayerElement) => void;
	onError?: (error: Error) => void;
}

let ruffleScriptPromise: Promise<void> | null = null;

function loadRuffleScript(scriptUrl: string, config?: RuffleConfig) {
	const ruffleWindow = getRuffleWindow();
	ruffleWindow.RufflePlayer = ruffleWindow.RufflePlayer ?? {};

	const mergedConfig = mergeRuffleConfig(
		ruffleWindow.RufflePlayer.config,
		config,
	);
	if (mergedConfig) {
		ruffleWindow.RufflePlayer.config = mergedConfig;
	}

	if (ruffleWindow.RufflePlayer.newest) {
		return Promise.resolve();
	}

	const existingScript = document.querySelector<HTMLScriptElement>(
		`script[data-kbve-ruffle="true"], #${RUFFLE_SCRIPT_ID}`,
	);

	if (ruffleScriptPromise) return ruffleScriptPromise;

	ruffleScriptPromise = new Promise<void>((resolve, reject) => {
		const script = existingScript ?? document.createElement('script');

		const cleanup = () => {
			script.removeEventListener('load', handleLoad);
			script.removeEventListener('error', handleError);
		};

		const handleLoad = () => {
			cleanup();
			resolve();
		};

		const handleError = () => {
			cleanup();
			ruffleScriptPromise = null;
			reject(new Error(`Failed to load Ruffle from ${scriptUrl}`));
		};

		script.addEventListener('load', handleLoad, { once: true });
		script.addEventListener('error', handleError, { once: true });

		if (!existingScript) {
			script.id = RUFFLE_SCRIPT_ID;
			script.dataset.kbveRuffle = 'true';
			script.async = true;
			script.src = scriptUrl;
			document.head.appendChild(script);
		}
	});

	return ruffleScriptPromise;
}

function toCssSize(value?: number | string) {
	return typeof value === 'number' ? `${value}px` : value;
}

export function ReactRuffle({
	src,
	cdn,
	version,
	scriptUrl,
	config,
	loadOptions,
	className,
	playerClassName,
	style,
	width = '100%',
	height = 480,
	title,
	id,
	allowFullscreen = true,
	replaceOnSrcChange = true,
	onReady,
	onError,
}: ReactRuffleProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const playerRef = useRef<RufflePlayerElement | null>(null);
	const [status, setStatus] = useState<RuffleStatus>('idle');

	const resolvedScriptUrl = useMemo(
		() => resolveRuffleScriptUrl({ cdn, version, scriptUrl }),
		[cdn, version, scriptUrl],
	);

	useEffect(() => {
		let cancelled = false;
		const container = containerRef.current;
		if (!container || !src) return undefined;

		setStatus('loading');

		void loadRuffleScript(resolvedScriptUrl, config)
			.then(() => {
				if (cancelled) return;

				const ruffle = getRuffleWindow().RufflePlayer?.newest?.();
				if (!ruffle) {
					throw new Error(
						'Ruffle loaded without exposing window.RufflePlayer.newest().',
					);
				}

				const existingPlayer = playerRef.current;
				const player =
					replaceOnSrcChange || !existingPlayer
						? ruffle.createPlayer()
						: existingPlayer;

				if (replaceOnSrcChange || !existingPlayer) {
					container.replaceChildren(player);
					playerRef.current = player;
				}

				if (id) player.id = id;
				if (title) player.title = title;
				if (playerClassName) player.className = playerClassName;
				player.style.width = '100%';
				player.style.height = '100%';
				if (allowFullscreen) {
					player.setAttribute('allowfullscreen', 'true');
				} else {
					player.removeAttribute('allowfullscreen');
				}

				const source =
					loadOptions && Object.keys(loadOptions).length > 0
						? { ...loadOptions, url: src }
						: src;

				return player
					.ruffle()
					.load(source)
					.then(() => {
						if (cancelled) return;
						setStatus('ready');
						onReady?.(player);
					});
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				const normalizedError =
					error instanceof Error ? error : new Error(String(error));
				setStatus('error');
				onError?.(normalizedError);
			});

		return () => {
			cancelled = true;
		};
	}, [
		allowFullscreen,
		config,
		id,
		loadOptions,
		onError,
		onReady,
		playerClassName,
		replaceOnSrcChange,
		resolvedScriptUrl,
		src,
		title,
	]);

	return (
		<div
			className={className}
			data-ruffle-status={status}
			style={{
				width: toCssSize(width),
				height: toCssSize(height),
				...style,
			}}>
			<div
				ref={containerRef}
				style={{ width: '100%', height: '100%' }}
				aria-label={title}
			/>
		</div>
	);
}

export default ReactRuffle;
