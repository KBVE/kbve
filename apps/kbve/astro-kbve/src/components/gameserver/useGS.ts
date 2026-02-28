// useGS.ts - Game Server singleton hook
// Core WebSocket logic for connecting to the Axum game server
import { useEffect, useState, useCallback, useRef } from 'react';
import { initSupa, getSupa } from '@/lib/supa';

export interface WSMessage {
	type: string;
	[key: string]: any;
}

export interface WSStatus {
	status: 'disconnected' | 'connecting' | 'connected' | 'error';
	error?: string;
}

export interface GameServerLog {
	timestamp: string;
	message: string;
	type: 'info' | 'success' | 'error';
}

export function useGS() {
	const [status, setStatus] = useState<WSStatus>({ status: 'disconnected' });
	const [logs, setLogs] = useState<GameServerLog[]>([]);
	const [session, setSession] = useState<any>(null);
	const supaRef = useRef<any>(null);
	const unsubscribeRefs = useRef<(() => void)[]>([]);

	const addLog = useCallback(
		(message: string, type: GameServerLog['type'] = 'info') => {
			setLogs((prev) => [
				...prev,
				{
					timestamp: new Date().toISOString(),
					message,
					type,
				},
			]);
		},
		[],
	);

	const clearLogs = useCallback(() => {
		setLogs([]);
	}, []);

	// Initialize Supabase and check session
	useEffect(() => {
		let mounted = true;

		(async () => {
			try {
				addLog('Initializing Supabase SharedWorker...', 'info');
				await initSupa();
				const supa = getSupa();
				supaRef.current = supa;

				if (!mounted) return;

				// Check initial session
				const s = await supa.getSession();
				if (s?.session) {
					setSession(s.session);
					addLog(
						`Authenticated as: ${s.session.user?.email || 'Unknown'}`,
						'success',
					);
				} else {
					setSession(null);
					addLog(
						'Not authenticated - sign in first at /auth/login',
						'error',
					);
				}

				// Listen for WebSocket status changes
				const unsubStatus = supa.onWebSocketStatus((wsStatus: any) => {
					if (!mounted) return;

					if (wsStatus.status === 'connected') {
						setStatus({ status: 'connected' });
						addLog('WebSocket connected', 'success');
					} else if (wsStatus.status === 'connecting') {
						setStatus({ status: 'connecting' });
						addLog('WebSocket connecting...', 'info');
					} else if (wsStatus.status === 'disconnected') {
						setStatus({ status: 'disconnected' });
						addLog('WebSocket disconnected', 'info');
					} else if (wsStatus.status === 'error') {
						setStatus({ status: 'error', error: wsStatus.error });
						addLog(
							`WebSocket error: ${wsStatus.error || 'Unknown'}`,
							'error',
						);
					}
				});

				// Listen for WebSocket messages
				const unsubMessage = supa.onWebSocketMessage(
					(message: WSMessage) => {
						if (!mounted) return;

						// Don't log heartbeat messages (too noisy)
						if (
							message.type === 'ping' ||
							message.type === 'pong'
						) {
							return;
						}

						addLog(
							`� Received: ${JSON.stringify(message)}`,
							'success',
						);
					},
				);

				unsubscribeRefs.current = [unsubStatus, unsubMessage];

				addLog('SharedWorker initialized', 'success');
			} catch (err: any) {
				if (mounted) {
					addLog(`Initialization failed: ${err.message}`, 'error');
				}
			}
		})();

		return () => {
			mounted = false;
			unsubscribeRefs.current.forEach((unsub) => unsub());
			unsubscribeRefs.current = [];
		};
	}, [addLog]);

	const connect = useCallback(async () => {
		if (!supaRef.current) {
			addLog('Supabase not initialized', 'error');
			return;
		}

		if (!session) {
			addLog('Must be authenticated to connect', 'error');
			return;
		}

		try {
			addLog('Connecting to WebSocket...', 'info');
			setStatus({ status: 'connecting' });
			await supaRef.current.connectWebSocket();
		} catch (err: any) {
			addLog(`Connection failed: ${err.message}`, 'error');
			setStatus({ status: 'error', error: err.message });
		}
	}, [session, addLog]);

	const disconnect = useCallback(async () => {
		if (!supaRef.current) {
			addLog('Supabase not initialized', 'error');
			return;
		}

		try {
			addLog('Disconnecting from WebSocket...', 'info');
			await supaRef.current.disconnectWebSocket();
			setStatus({ status: 'disconnected' });
			addLog('Disconnected', 'success');
		} catch (err: any) {
			addLog(`Disconnect failed: ${err.message}`, 'error');
		}
	}, [addLog]);

	const send = useCallback(
		async (message: WSMessage) => {
			if (!supaRef.current) {
				addLog('Supabase not initialized', 'error');
				return;
			}

			try {
				addLog(`� Sending: ${JSON.stringify(message)}`, 'info');
				await supaRef.current.sendWebSocketMessage(message);
			} catch (err: any) {
				addLog(`Send failed: ${err.message}`, 'error');
			}
		},
		[addLog],
	);

	const checkStatus = useCallback(async () => {
		if (!supaRef.current) {
			addLog('Supabase not initialized', 'error');
			return;
		}

		try {
			const wsStatus = await supaRef.current.getWebSocketStatus();
			addLog(`Current status: ${JSON.stringify(wsStatus)}`, 'info');
		} catch (err: any) {
			addLog(`Status check failed: ${err.message}`, 'error');
		}
	}, [addLog]);

	return {
		status,
		logs,
		session,
		connect,
		disconnect,
		send,
		checkStatus,
		clearLogs,
		addLog,
	};
}
