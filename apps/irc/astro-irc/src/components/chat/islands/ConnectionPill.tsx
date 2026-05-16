/** @jsxImportSource react */
import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
	$connectionStatus,
	$error,
	connect,
	disconnect,
	type ConnectionStatus,
} from '../service';
import { $authState, $authToken, $swReady } from '../auth';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
	connected: 'Online',
	connecting: 'Connecting…',
	disconnected: 'Offline',
	error: 'Error',
};

export interface ConnectionPillProps {
	wsUrl?: string;
}

export const ConnectionPill: React.FC<ConnectionPillProps> = ({
	wsUrl = 'wss://chat.kbve.com/ws',
}) => {
	const status = useStore($connectionStatus);
	const error = useStore($error);
	const authState = useStore($authState);
	const token = useStore($authToken);
	const swReady = useStore($swReady);

	const handleToggle = useCallback(() => {
		if (status === 'connected') {
			disconnect();
		} else if (token && swReady) {
			connect(wsUrl, token);
		}
	}, [status, token, swReady, wsUrl]);

	if (authState !== 'auth') return null;

	const connectDisabled = !swReady && status !== 'connected';

	return (
		<>
			<div
				className="kbve-chat__status"
				title={
					!swReady
						? 'Waiting for chat worker…'
						: error || STATUS_LABEL[status]
				}>
				<span
					className={`kbve-chat__status-dot kbve-chat__status-dot--${swReady ? status : 'connecting'}`}
				/>
				<span>{swReady ? STATUS_LABEL[status] : 'Booting…'}</span>
			</div>
			<button
				type="button"
				onClick={handleToggle}
				disabled={connectDisabled}
				className={`kbve-chat__btn ${status === 'connected' ? 'kbve-chat__btn--danger' : ''}`}>
				{status === 'connected' ? 'Disconnect' : 'Connect'}
			</button>
		</>
	);
};
