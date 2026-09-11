/** @jsxImportSource react */
import { useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $connectionStatus, $disconnect, connect } from '../service';
import { $authState, $authToken, $swReady } from '../auth';

export interface ConnectionBannerProps {
	wsUrl?: string;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
	wsUrl = 'wss://chat.kbve.com/ws',
}) => {
	const status = useStore($connectionStatus);
	const info = useStore($disconnect);
	const authState = useStore($authState);
	const token = useStore($authToken);
	const swReady = useStore($swReady);

	const reconnect = useCallback(() => {
		if (token && swReady) connect(wsUrl, token);
	}, [token, swReady, wsUrl]);

	// Coming back to the tab is the signal that the user is no longer idle, so
	// that's when we rejoin. The worker deliberately does not retry an idle
	// close on its own — it can't tell whether anyone is still watching.
	useEffect(() => {
		if (status !== 'idle') return;
		const onVisible = () => {
			if (document.visibilityState === 'visible') reconnect();
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', onVisible);
		};
	}, [status, reconnect]);

	if (authState !== 'auth') return null;
	if (status === 'connected') return null;
	if (status === 'connecting') {
		return (
			<div className="kbve-chat__banner kbve-chat__banner--pending">
				<span className="kbve-chat__banner-text">Reconnecting…</span>
			</div>
		);
	}
	if (!info) return null;

	const text =
		info.kind === 'idle'
			? 'You were disconnected for inactivity.'
			: info.kind === 'failed'
				? "Couldn't reconnect after several tries."
				: 'Connection lost.';

	return (
		<div
			className={`kbve-chat__banner kbve-chat__banner--${info.kind === 'idle' ? 'idle' : 'error'}`}>
			<span className="kbve-chat__banner-text">{text}</span>
			<button
				type="button"
				onClick={reconnect}
				disabled={!swReady || !token}
				className="kbve-chat__banner-btn">
				Reconnect
			</button>
		</div>
	);
};
