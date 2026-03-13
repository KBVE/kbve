import { useEffect, useState } from 'react';
import { go_online, get_online_status } from '../../wasm-pkg/isometric_game.js';
import { GlassPanel } from '../ui/shared/GlassPanel';

/**
 * Read the Supabase access token from the shared IndexedDB (`sb-auth-v2`).
 * The astro-kbve auth system stores sessions here via IDBStorage/Dexie.
 * Key format: `sb-<host>-auth-token` where host is the first subdomain segment.
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
				const cursor = store.openCursor();
				let found = false;

				cursor.onsuccess = () => {
					const result = cursor.result;
					if (!result) {
						if (!found) resolve('');
						return;
					}
					const key = result.key as string;
					if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
						found = true;
						try {
							const session = JSON.parse(result.value.value);
							resolve(session?.access_token ?? '');
						} catch {
							resolve('');
						}
					} else {
						result.continue();
					}
				};

				cursor.onerror = () => resolve('');
			} catch {
				resolve('');
			}
		};
	});
}

export function GoOnlineButton() {
	const [online, setOnline] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [hasAuth, setHasAuth] = useState<boolean | null>(null);

	// Check if user is logged in (has a Supabase session)
	useEffect(() => {
		getSupabaseJwt().then((jwt) => setHasAuth(jwt.length > 0));
	}, []);

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

	const handleClick = async () => {
		if (online || connecting) return;
		setConnecting(true);
		try {
			const jwt = await getSupabaseJwt();
			if (!jwt) {
				setConnecting(false);
				return;
			}
			go_online('', jwt);
		} catch {
			setConnecting(false);
		}
	};

	// Don't show button if auth check hasn't completed
	if (hasAuth === null) return null;

	const label = online
		? 'Online'
		: connecting
			? 'Connecting...'
			: hasAuth
				? 'Go Online'
				: 'Sign In to Play';

	return (
		<GlassPanel className="absolute bottom-4 right-4 md:bottom-6 md:right-6">
			<button
				onClick={handleClick}
				disabled={online || connecting || !hasAuth}
				className={`px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-xs font-bold tracking-wider uppercase pointer-events-auto transition-colors ${
					online
						? 'text-green-400 cursor-default'
						: connecting
							? 'text-yellow-400 cursor-wait'
							: hasAuth
								? 'text-text hover:text-white cursor-pointer'
								: 'text-text-muted cursor-not-allowed'
				}`}>
				<span
					className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
						online
							? 'bg-green-400'
							: connecting
								? 'bg-yellow-400 animate-pulse'
								: hasAuth
									? 'bg-red-400'
									: 'bg-gray-500'
					}`}
				/>
				{label}
			</button>
		</GlassPanel>
	);
}
