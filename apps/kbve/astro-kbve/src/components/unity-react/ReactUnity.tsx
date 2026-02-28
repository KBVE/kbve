/**
 * ReactUnity Component
 * Main React component for Unity WebGL integration
 * Uses react-unity-webgl library
 */

import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';
import { unityService } from './unityService';
import { initSupa, getSupa } from '@/lib/supa';
import type { UnityConfig, UnityEvent } from './typeUnity';
import { UnityEventType } from './typeUnity';

type Session = any;

/**
 * ReactUnity Component Props
 */
export interface ReactUnityProps {
	/**
	 * Unity build configuration
	 */
	config: UnityConfig;

	/**
	 * CSS class name for the container
	 */
	className?: string;

	/**
	 * Canvas ID (default: 'unity-canvas')
	 */
	canvasId?: string;

	/**
	 * Whether to show fullscreen button (default: true)
	 */
	showFullscreenButton?: boolean;

	/**
	 * Whether to start in fullscreen mode (default: false)
	 */
	startFullscreen?: boolean;

	/**
	 * Custom loading component
	 */
	loadingComponent?: React.ReactNode;

	/**
	 * Callback when Unity is ready
	 */
	onReady?: () => void;

	/**
	 * Callback for Unity events
	 */
	onUnityEvent?: (event: UnityEvent) => void;

	/**
	 * Callback for errors
	 */
	onError?: (error: string) => void;

	/**
	 * Device pixel ratio (default: window.devicePixelRatio)
	 */
	devicePixelRatio?: number;

	/**
	 * Tab index (default: 1)
	 */
	tabIndex?: number;
}

/**
 * Default Loading Component
 */
const DefaultLoading: FC<{ progress: number }> = ({ progress }) => (
	<div className="unity-loading">
		<div className="unity-loading-content">
			<div className="unity-loading-spinner"></div>
			<div className="unity-loading-bar">
				<div
					className="unity-loading-bar-fill"
					style={{ width: `${progress * 100}%` }}></div>
			</div>
			<p className="unity-loading-text">
				Loading Unity... {Math.round(progress * 100)}%
			</p>
		</div>
	</div>
);

/**
 * ReactUnity Component
 */
export const ReactUnity: FC<ReactUnityProps> = ({
	config,
	className = '',
	canvasId = 'unity-canvas',
	showFullscreenButton = true,
	startFullscreen = false,
	loadingComponent,
	onReady,
	onUnityEvent,
	onError,
	devicePixelRatio,
	tabIndex = 1,
}) => {
	const [session, setSession] = useState<Session | null>(null);
	const [sessionReady, setSessionReady] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [bridgeReady, setBridgeReady] = useState(false);

	// Use the react-unity-webgl hook
	const {
		unityProvider,
		isLoaded,
		loadingProgression,
		requestFullscreen,
		unload,
		sendMessage,
		addEventListener,
		removeEventListener,
	} = useUnityContext(config);

	/**
	 * Initialize Supabase connection and listen for session changes
	 * Uses the SharedWorker directly (same pattern as ReactNav)
	 */
	useEffect(() => {
		let off: (() => void) | null = null;
		(async () => {
			try {
				await initSupa();
				const supa = getSupa();

				// Get initial session
				const s = await supa.getSession().catch(() => null);
				console.log(
					'[ReactUnity] Initial session from SharedWorker:',
					s?.session ? 'logged in' : 'not logged in',
				);
				setSession(s?.session ?? null);

				// Listen for session changes (login/logout)
				off = supa.on('auth', (msg: any) => {
					console.log(
						'[ReactUnity] Session changed:',
						msg.session ? 'logged in' : 'logged out',
					);
					setSession(msg.session ?? null);
				});

				setSessionReady(true);
			} catch (e: any) {
				console.error('[ReactUnity] Error initializing Supabase:', e);
				setSessionReady(true); // Still mark as ready to prevent blocking
			}
		})();

		return () => off?.();
	}, []);

	/**
	 * Register Unity instance with singleton service
	 */
	useEffect(() => {
		if (isLoaded) {
			unityService.setUnityContext({
				sendMessage,
				requestFullscreen,
				unload,
			});
			onReady?.();

			// Emit loaded event
			const event: UnityEvent = {
				type: UnityEventType.GAME_LOADED,
				timestamp: Date.now(),
			};
			unityService.emit(event);
			onUnityEvent?.(event);

			// Request fullscreen if configured
			if (startFullscreen) {
				requestFullscreen(true);
			}
		}
	}, [
		isLoaded,
		sendMessage,
		requestFullscreen,
		unload,
		onReady,
		startFullscreen,
		onUnityEvent,
	]);

	/**
	 * Listen for Unity bridge ready signal
	 * Unity sends "BridgeReady" after VContainer initialization completes
	 * NOTE: We listen to window CustomEvent (from jslib) not react-unity-webgl's addEventListener
	 */
	useEffect(() => {
		const handleUnityMessage = ((event: CustomEvent) => {
			try {
				const { type, data } = event.detail;

				// Only handle BridgeReady events
				if (type === 'BridgeReady') {
					console.log('[ReactUnity] ✓ Unity bridge is ready:', data);
					setBridgeReady(true);

					// Debug session state
					console.log(
						'[ReactUnity] → Checking session state for handshake:',
					);
					console.log('  - isLoaded:', isLoaded);
					console.log('  - bridgeReady: true (just set)');
					console.log('  - sessionReady:', sessionReady);
					console.log(
						'  - session:',
						session
							? '✓ Present'
							: '✗ Missing (user not logged in)',
					);
				}
			} catch (error) {
				console.error(
					'[ReactUnity] Error handling Unity message:',
					error,
				);
			}
		}) as EventListener;

		// Listen to the window CustomEvent dispatched by our jslib
		window.addEventListener('UnityMessage', handleUnityMessage);

		return () => {
			window.removeEventListener('UnityMessage', handleUnityMessage);
		};
	}, [isLoaded, sessionReady, session]);

	/**
	 * Listen for SessionReceived acknowledgment from Unity
	 */
	useEffect(() => {
		const handleUnityMessage = ((event: CustomEvent) => {
			try {
				const { type, data } = event.detail;

				// Only handle SessionReceived events
				if (type === 'SessionReceived') {
					console.log(
						'[ReactUnity] ✓ Unity acknowledged session data:',
						data,
					);
					console.log(
						'[ReactUnity] ✓✓✓ HANDSHAKE COMPLETE - Bidirectional communication established!',
					);
				}
			} catch (error) {
				console.error(
					'[ReactUnity] Error handling SessionReceived:',
					error,
				);
			}
		}) as EventListener;

		window.addEventListener('UnityMessage', handleUnityMessage);

		return () => {
			window.removeEventListener('UnityMessage', handleUnityMessage);
		};
	}, []);

	/**
	 * Send session info to Unity when bridge is ready and session is available
	 * IMPORTANT: Wait for bridgeReady to avoid race condition where Unity's
	 * VContainer hasn't finished instantiating the WebGLBridge GameObject yet
	 */
	useEffect(() => {
		console.log(
			'[ReactUnity] Session effect triggered - checking conditions:',
			{
				isLoaded,
				bridgeReady,
				sessionReady,
				hasSession: !!session,
			},
		);

		if (isLoaded && bridgeReady && sessionReady && session) {
			const user = session.user;
			// Extract username - check all OAuth provider fields
			// GitHub: user_name, Discord: global_name/name, Twitch: preferred_username
			const username =
				user?.user_metadata?.user_name || // GitHub
				user?.user_metadata?.preferred_username || // Twitch
				user?.user_metadata?.username || // Generic
				user?.user_metadata?.global_name || // Discord
				user?.user_metadata?.name || // Discord/Twitch fallback
				user?.email?.split('@')[0] ||
				'Player';

			// Display name can be full_name or fallback to username
			const displayName = user?.user_metadata?.full_name || username;

			const avatarUrl =
				user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

			// Get JWT tokens from session
			const accessToken = session.access_token || '';
			const refreshToken = session.refresh_token || '';
			const expiresAt = session.expires_at || 0;

			console.log('[ReactUnity] → Sending session update to Unity:', {
				userId: user?.id,
				displayName,
				username,
				hasAccessToken: !!accessToken,
				hasRefreshToken: !!refreshToken,
				expiresAt,
			});

			sendMessage(
				'WebGLBridge',
				'OnSessionUpdate',
				JSON.stringify({
					userId: user?.id,
					email: user?.email,
					displayName,
					username,
					avatarUrl,
					accessToken,
					refreshToken,
					expiresAt,
				}),
			);
		}
	}, [isLoaded, bridgeReady, sessionReady, session, sendMessage]);

	/**
	 * Listen for TokenRefreshRequest from Unity
	 */
	useEffect(() => {
		const handleUnityMessage = ((event: CustomEvent) => {
			try {
				const { type } = event.detail;

				// Only handle TokenRefreshRequest events
				if (type === 'TokenRefreshRequest') {
					console.log('[ReactUnity] Unity requested token refresh');

					// Send the current session back to Unity
					// The SharedWorker automatically handles token refresh
					if (session && sessionReady) {
						const user = session.user;
						const username =
							user?.user_metadata?.user_name ||
							user?.user_metadata?.preferred_username ||
							user?.user_metadata?.username ||
							user?.user_metadata?.global_name ||
							user?.user_metadata?.name ||
							user?.email?.split('@')[0] ||
							'Player';
						const displayName =
							user?.user_metadata?.full_name || username;
						const avatarUrl =
							user?.user_metadata?.avatar_url ||
							user?.user_metadata?.picture;

						sendMessage(
							'WebGLBridge',
							'OnSessionUpdate',
							JSON.stringify({
								userId: user?.id,
								email: user?.email,
								displayName,
								username,
								avatarUrl,
								accessToken: session.access_token || '',
								refreshToken: session.refresh_token || '',
								expiresAt: session.expires_at || 0,
							}),
						);

						console.log(
							'[ReactUnity] ✓ Sent refreshed tokens to Unity',
						);
					} else {
						console.warn(
							'[ReactUnity] Cannot refresh tokens - no session available',
						);
					}
				}
			} catch (error) {
				console.error(
					'[ReactUnity] Error handling TokenRefreshRequest:',
					error,
				);
			}
		}) as EventListener;

		window.addEventListener('UnityMessage', handleUnityMessage);

		return () => {
			window.removeEventListener('UnityMessage', handleUnityMessage);
		};
	}, [sendMessage, session, sessionReady]);

	/**
	 * Listen for custom Unity events
	 * These match the MessageTypes from Unity's JavaScript bridge
	 */
	useEffect(() => {
		const handleCustomEvent = (eventType: string, data: string) => {
			try {
				const parsedData = data ? JSON.parse(data) : {};
				const event: UnityEvent = {
					type: eventType,
					data: parsedData,
					timestamp: Date.now(),
				};
				unityService.emit(event);
				onUnityEvent?.(event);
			} catch (error) {
				console.error('Error parsing Unity event data:', error);
			}
		};

		// Game lifecycle events
		addEventListener('GameReady', () =>
			handleCustomEvent(UnityEventType.GAME_READY, '{}'),
		);
		addEventListener('GamePaused', (data) =>
			handleCustomEvent(UnityEventType.GAME_PAUSED, data),
		);
		addEventListener('GameResumed', (data) =>
			handleCustomEvent(UnityEventType.GAME_RESUMED, data),
		);
		addEventListener('GameOver', (data) =>
			handleCustomEvent(UnityEventType.GAME_OVER, data),
		);
		addEventListener('LevelStarted', (data) =>
			handleCustomEvent(UnityEventType.LEVEL_STARTED, data),
		);
		addEventListener('LevelCompleted', (data) =>
			handleCustomEvent(UnityEventType.LEVEL_COMPLETED, data),
		);

		// Player events
		addEventListener('PlayerSpawned', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_SPAWNED, data),
		);
		addEventListener('PlayerDied', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_DIED, data),
		);
		addEventListener('PlayerRespawned', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_RESPAWNED, data),
		);
		addEventListener('PlayerMoved', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_MOVED, data),
		);
		addEventListener('PlayerStatsUpdated', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_STATS_UPDATED, data),
		);
		addEventListener('PlayerInventoryUpdated', (data) =>
			handleCustomEvent(UnityEventType.PLAYER_INVENTORY_UPDATED, data),
		);

		// Entity events
		addEventListener('EntitySpawned', (data) =>
			handleCustomEvent(UnityEventType.ENTITY_SPAWNED, data),
		);
		addEventListener('EntityDestroyed', (data) =>
			handleCustomEvent(UnityEventType.ENTITY_DESTROYED, data),
		);
		addEventListener('EntityUpdated', (data) =>
			handleCustomEvent(UnityEventType.ENTITY_UPDATED, data),
		);

		// Terrain events
		addEventListener('ChunkLoaded', (data) =>
			handleCustomEvent(UnityEventType.CHUNK_LOADED, data),
		);
		addEventListener('ChunkUnloaded', (data) =>
			handleCustomEvent(UnityEventType.CHUNK_UNLOADED, data),
		);
		addEventListener('TerrainGenerated', (data) =>
			handleCustomEvent(UnityEventType.TERRAIN_GENERATED, data),
		);

		// Score and progress events
		addEventListener('ScoreUpdated', (data) =>
			handleCustomEvent(UnityEventType.SCORE_UPDATED, data),
		);
		addEventListener('AchievementUnlocked', (data) =>
			handleCustomEvent(UnityEventType.ACHIEVEMENT_UNLOCKED, data),
		);
		addEventListener('ProgressUpdated', (data) =>
			handleCustomEvent(UnityEventType.PROGRESS_UPDATED, data),
		);

		// Data persistence events
		addEventListener('DataSaved', (data) =>
			handleCustomEvent(UnityEventType.DATA_SAVED, data),
		);
		addEventListener('DataLoaded', (data) =>
			handleCustomEvent(UnityEventType.DATA_LOADED, data),
		);

		// Custom and error events
		addEventListener('CustomEvent', (data) =>
			handleCustomEvent(UnityEventType.CUSTOM, data),
		);
		addEventListener('Error', (data) =>
			handleCustomEvent(UnityEventType.ERROR, data),
		);
		addEventListener('Warning', (data) =>
			handleCustomEvent(UnityEventType.WARNING, data),
		);

		return () => {
			// Note: react-unity-webgl's removeEventListener requires the same callback
			// Since we're using an arrow function in addEventListener, cleanup is handled by React
			// The subscriptions will be cleaned up when the component unmounts
		};
	}, [addEventListener, removeEventListener, onUnityEvent]);

	/**
	 * Toggle fullscreen
	 */
	const handleFullscreenToggle = useCallback(() => {
		requestFullscreen(!isFullscreen);
		setIsFullscreen(!isFullscreen);
	}, [isFullscreen, requestFullscreen]);

	/**
	 * Handle fullscreen change events
	 */
	useEffect(() => {
		const handleFullscreenChange = () => {
			const isCurrentlyFullscreen = !!(
				document.fullscreenElement ||
				(document as any).webkitFullscreenElement ||
				(document as any).mozFullScreenElement ||
				(document as any).msFullscreenElement
			);
			setIsFullscreen(isCurrentlyFullscreen);
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener(
			'webkitfullscreenchange',
			handleFullscreenChange,
		);
		document.addEventListener(
			'mozfullscreenchange',
			handleFullscreenChange,
		);
		document.addEventListener('msfullscreenchange', handleFullscreenChange);

		return () => {
			document.removeEventListener(
				'fullscreenchange',
				handleFullscreenChange,
			);
			document.removeEventListener(
				'webkitfullscreenchange',
				handleFullscreenChange,
			);
			document.removeEventListener(
				'mozfullscreenchange',
				handleFullscreenChange,
			);
			document.removeEventListener(
				'msfullscreenchange',
				handleFullscreenChange,
			);
		};
	}, []);

	return (
		<div
			className={`unity-container ${className}`}
			style={{
				position: 'relative',
				width: '100%',
				height: '100%',
				overflow: 'hidden',
			}}>
			{/* Unity Component from react-unity-webgl */}
			<Unity
				unityProvider={unityProvider}
				id={canvasId}
				className="unity-canvas"
				style={{
					width: '100%',
					height: '100%',
					visibility: isLoaded ? 'visible' : 'hidden',
					background: '#000',
				}}
				devicePixelRatio={devicePixelRatio}
				tabIndex={tabIndex}
			/>

			{/* Loading Overlay */}
			{!isLoaded && (
				<div
					className="unity-loading-overlay"
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: '#000',
						zIndex: 10,
					}}>
					{loadingComponent || (
						<DefaultLoading progress={loadingProgression} />
					)}
				</div>
			)}

			{/* Fullscreen Button */}
			{showFullscreenButton && isLoaded && (
				<button
					onClick={handleFullscreenToggle}
					className="unity-fullscreen-button"
					style={{
						position: 'absolute',
						top: '1rem',
						right: '1rem',
						padding: '0.5rem 1rem',
						background: 'rgba(0, 0, 0, 0.7)',
						color: 'white',
						border: '1px solid rgba(255, 255, 255, 0.3)',
						borderRadius: '4px',
						cursor: 'pointer',
						zIndex: 20,
						fontSize: '0.875rem',
						transition: 'background 0.2s',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
					}}>
					{isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
				</button>
			)}
		</div>
	);
};

export default ReactUnity;
