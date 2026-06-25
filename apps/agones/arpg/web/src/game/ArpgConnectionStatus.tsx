import { useEffect, useState } from 'react';
import { onConnection, onPlayers, type ConnectionView } from './systems/hud';

// In-game connection feedback that lives ALONGSIDE the world (unlike the boot
// overlay, which only covers the pre-spawn phase):
//   - a top banner when the socket drops mid-game (reconnecting / disconnected),
//     so a frozen world reads as a clear state instead of an unexplained hang;
//   - a subtle "N online" chip, so solo play reads as "you're alone" rather than
//     "multiplayer is broken".
export default function ArpgConnectionStatus() {
	const [conn, setConn] = useState<ConnectionView | null>(null);
	const [players, setPlayers] = useState<number | null>(null);

	useEffect(() => {
		const offConn = onConnection(setConn);
		const offPlayers = onPlayers(setPlayers);
		return () => {
			offConn();
			offPlayers();
		};
	}, []);

	const degraded =
		conn?.status === 'reconnecting' || conn?.status === 'closed';

	return (
		<>
			{degraded && (
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: '12px',
						padding: '8px 12px',
						background:
							conn?.status === 'closed'
								? 'rgba(127,29,29,0.95)'
								: 'rgba(120,90,20,0.95)',
						color: '#fde8c8',
						fontFamily: 'monospace',
						fontSize: '13px',
						zIndex: 40,
					}}>
					{conn?.status === 'reconnecting' ? (
						<span>
							Connection lost — reconnecting ({conn.attempts}/
							{conn.maxAttempts})…
						</span>
					) : (
						<>
							<span>Disconnected from the server.</span>
							<button
								type="button"
								onClick={() => window.location.reload()}
								style={{
									padding: '3px 10px',
									fontFamily: 'monospace',
									fontSize: '12px',
									fontWeight: 700,
									borderRadius: '4px',
									border: 'none',
									cursor: 'pointer',
									background: '#fca5a5',
									color: '#0b0e16',
								}}>
								Reload
							</button>
						</>
					)}
				</div>
			)}
			{players != null && conn?.status !== 'closed' && (
				<div
					style={{
						position: 'absolute',
						top: '8px',
						right: '10px',
						padding: '3px 9px',
						borderRadius: '999px',
						background: 'rgba(8,9,14,0.6)',
						border: '1px solid #2a3550',
						color: players > 1 ? '#86efac' : '#9fb3d8',
						fontFamily: 'monospace',
						fontSize: '12px',
						zIndex: 35,
						pointerEvents: 'none',
					}}>
					{players > 1 ? `${players} online` : 'You’re alone'}
				</div>
			)}
		</>
	);
}
