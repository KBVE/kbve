import { useEffect, useRef, useState, useCallback } from 'react';
import { go_online, get_online_status } from '../../wasm-pkg/isometric_game.js';
import { GlassPanel } from '../ui/shared/GlassPanel';

/**
 * Read the Supabase access token from the shared IndexedDB (`sb-auth-v2`).
 * The astro-kbve auth system stores sessions here via IDBStorage/Dexie.
 * Supabase JS v2 uses key: `supabase.auth.token`
 */
async function getSupabaseJwt(): Promise<string> {
	return new Promise((resolve) => {
		const request = indexedDB.open('sb-auth-v2', 1);

		request.onerror = () => resolve('');

		request.onupgradeneeded = () => {
			// DB doesn't exist yet — user isn't logged in
			request.transaction?.abort();
			resolve('');
		};

		request.onsuccess = () => {
			const db = request.result;
			try {
				const tx = db.transaction('kv', 'readonly');
				const store = tx.objectStore('kv');

				// Try the exact Supabase v2 key first
				const getReq = store.get('supabase.auth.token');

				getReq.onsuccess = () => {
					if (getReq.result?.value) {
						try {
							const session = JSON.parse(getReq.result.value);
							resolve(session?.access_token ?? '');
							return;
						} catch {
							// fall through to cursor scan
						}
					}

					// Fallback: scan all keys for any auth token
					const cursor = store.openCursor();
					cursor.onsuccess = () => {
						const result = cursor.result;
						if (!result) {
							resolve('');
							return;
						}
						const key = result.key as string;
						if (key.includes('auth') && key.includes('token')) {
							try {
								const val = JSON.parse(result.value.value);
								resolve(val?.access_token ?? '');
							} catch {
								result.continue();
							}
						} else {
							result.continue();
						}
					};
					cursor.onerror = () => resolve('');
				};

				getReq.onerror = () => resolve('');
			} catch {
				resolve('');
			}
		};
	});
}

/** Read the WebSocket URL from the ClientProfile in localStorage. */
function resolveWsUrl(): string {
	try {
		const raw = localStorage.getItem('kbve_client_profile');
		if (raw) {
			const profile = JSON.parse(raw);
			if (profile.ws_url) return profile.ws_url;
		}
	} catch {
		/* fall through */
	}
	// Fallback: derive from origin (should never happen if main.tsx ran first)
	const hostname = window.location.hostname;
	const isSecure = window.location.protocol === 'https:';
	const scheme = isSecure ? 'wss' : 'ws';
	const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
	return isLocal ? `${scheme}://${hostname}:5000` : `wss://${hostname}/ws`;
}

export function GoOnlineButton() {
	const [online, setOnline] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [hasAuth, setHasAuth] = useState<boolean | null>(null);

	// Track whether the user has opted into going online this session.
	// Used by the visibilitychange handler to auto-reconnect.
	const wantOnline = useRef(false);
	// Guard against concurrent reconnect attempts.
	const reconnecting = useRef(false);

	// Check if user is logged in (has a Supabase session)
	useEffect(() => {
		getSupabaseJwt().then((jwt) => setHasAuth(jwt.length > 0));
	}, []);

	// Shared connect logic — used by both the button and auto-reconnect.
	const doConnect = useCallback(async () => {
		if (reconnecting.current) return;
		reconnecting.current = true;
		try {
			const jwt = await getSupabaseJwt();
			const wsUrl = resolveWsUrl();
			go_online(wsUrl, jwt);
		} finally {
			// Clear the guard after a short delay so the status poll
			// has time to detect the new connection attempt.
			setTimeout(() => {
				reconnecting.current = false;
			}, 2000);
		}
	}, []);

	// Poll connection status every 500ms.
	useEffect(() => {
		const interval = setInterval(() => {
			try {
				const status = get_online_status();
				setOnline(status);
				if (status) setConnecting(false);
			} catch {
				// WASM not ready
			}
		}, 500);
		return () => clearInterval(interval);
	}, []);

	// Auto-reconnect when the tab becomes visible again.
	// Browsers throttle / tear down WebSocket connections in backgrounded
	// tabs. When the user returns and we detect the connection dropped,
	// silently reconnect using the same params.
	useEffect(() => {
		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') return;
			if (!wantOnline.current) return;

			// Give the status poll a moment to settle — the connection may
			// still be alive but the poll hasn't fired yet.
			setTimeout(() => {
				try {
					if (!get_online_status()) {
						console.log(
							'[GoOnlineButton] tab resumed, connection lost — auto-reconnecting',
						);
						setConnecting(true);
						doConnect();
					}
				} catch {
					// WASM not ready
				}
			}, 600);
		};

		document.addEventListener('visibilitychange', onVisibilityChange);
		return () =>
			document.removeEventListener(
				'visibilitychange',
				onVisibilityChange,
			);
	}, [doConnect]);

	const handleClick = async () => {
		if (online || connecting) return;
		setConnecting(true);
		wantOnline.current = true;
		await doConnect();
	};

	// Don't show button if auth check hasn't completed
	if (hasAuth === null) return null;

	const label = online
		? 'Online'
		: connecting
			? 'Connecting...'
			: hasAuth
				? 'Go Online'
				: 'Go Online (Guest)';

	return (
		<GlassPanel className="absolute bottom-4 right-4 md:bottom-6 md:right-6">
			<button
				onClick={handleClick}
				disabled={online || connecting}
				className={`px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-xs font-bold tracking-wider uppercase pointer-events-auto transition-colors ${
					online
						? 'text-green-400 cursor-default'
						: connecting
							? 'text-yellow-400 cursor-wait'
							: 'text-text hover:text-white cursor-pointer'
				}`}>
				<span
					className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
						online
							? 'bg-green-400'
							: connecting
								? 'bg-yellow-400 animate-pulse'
								: hasAuth
									? 'bg-blue-400'
									: 'bg-red-400'
					}`}
				/>
				{label}
			</button>
		</GlassPanel>
	);
}
