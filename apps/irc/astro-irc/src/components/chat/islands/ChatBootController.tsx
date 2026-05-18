/** @jsxImportSource react */
import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	bootAuth,
	refreshAuth,
	$authState,
	$authToken,
	$bootReady,
	$bootError,
} from '../auth';
import { $connectionStatus, connect, disconnect } from '../service';

export interface ChatBootControllerProps {
	wsUrl?: string;
}

export const ChatBootController: React.FC<ChatBootControllerProps> = ({
	wsUrl = 'wss://chat.kbve.com/ws',
}) => {
	const authState = useStore($authState);
	const token = useStore($authToken);
	const ready = useStore($bootReady);
	const bootError = useStore($bootError);

	useEffect(() => {
		void bootAuth();
	}, []);

	// Skeleton hide rule: drop overlay only when auth resolved AND either
	// boot finished cleanly OR we hit an error worth surfacing. Don't hide
	// while still mid-boot — otherwise UI flashes empty before WS ready.
	useEffect(() => {
		const skel = document.querySelector('.kbve-chat__skeleton');
		if (!skel) return;
		const settled =
			(authState !== 'loading' && ready) ||
			bootError.length > 0 ||
			authState === 'anon';
		if (settled) {
			skel.setAttribute('data-ready', 'true');
		}
	}, [authState, ready, bootError]);

	// WS connect gated on BOTH auth + boot readiness — prevents the race
	// where authState=auth fires before window.kbve.ws is callable.
	useEffect(() => {
		if (
			authState === 'auth' &&
			ready &&
			token &&
			$connectionStatus.get() === 'disconnected'
		) {
			connect(wsUrl, token);
		}
	}, [authState, ready, token, wsUrl]);

	useEffect(() => {
		if (authState !== 'no-username') return;
		let cancelled = false;
		const tick = async () => {
			if (cancelled) return;
			const next = await refreshAuth();
			if (cancelled) return;
			if (next === 'no-username') {
				timer = window.setTimeout(tick, 15_000);
			}
		};
		let timer = window.setTimeout(tick, 15_000);
		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				window.clearTimeout(timer);
				void tick();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, [authState]);

	useEffect(() => {
		const handleUnload = () => {
			if ($connectionStatus.get() === 'connected') {
				disconnect();
			}
		};
		window.addEventListener('beforeunload', handleUnload);
		return () => {
			window.removeEventListener('beforeunload', handleUnload);
			handleUnload();
		};
	}, []);

	return null;
};
